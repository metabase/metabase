(ns metabase-enterprise.workspaces.mirroring.adjustments
  "Queries of mirrored entities have to be adjusted to point to mirrored resources.

  Motivation:
  X1 --produces-- T1 --used-in-query-by-- X2
  Let's include both transforms in a workspace. Copies would look as follows:
  X1c --produces-- T1c --used-in-query-by-- X2c
  
  The X2c is now dependent on T1c. Hence references to T1 in the X2c have to be adjusted to point to T1c instead."
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- field-mappings
  "Return a map of {old-field-id new-field-id}. Matching against name. Name is unique."
  [old-table-id new-table-id]
  (let [old-fields (t2/select [:model/Field :id :name] :table_id old-table-id)
        new-fields (t2/select [:model/Field :id :name] :table_id new-table-id)
        old->new (u/for-map
                  [{:keys [id name]} old-fields]
                   (let [matching-id (:id (m/find-first (comp #{name} :name) new-fields))]
                     [id matching-id]))]
    (assert (= (count old-fields) (count new-fields) (count old->new)))
    old->new))

;; TODO (lbrdnk 2025-11-20) This is naive and should by handled by _some_ lib function.
(defn- query-table-id
  "Get source table from query. Queries with source-card not supported. "
  [query]
  (u/prog1 (some-> query :stages first :source-table)
    (assert (pos-int? <>))))

(defn- mappings
  "Return map of {<:tables|:fields> {old-id new-id}}. `new-table-id` is id of duplicated table a transform depends on."
  [old-table-id new-table-id]
  (let [fields-old->new (field-mappings old-table-id new-table-id)]
    {:fields fields-old->new
     :tables {old-table-id new-table-id}}))

(defn- clause-dispatch
  [x & _]
  (cond

    (and (vector? x)
         (= :field (first x))
         (= 3 (count x))
         (pos-int? (nth x 2)))
    ::num-field

    (and (map-entry? x)
         (= :source-table (key x)))
    ::source-table-entry

    :else
    ::default))

(defmulti ^:private rewrite-clause
  "Given clause and mapping return clause with updated id"
  #'clause-dispatch)

(defmethod rewrite-clause ::default
  [x _mappings]
  x)

(defmethod rewrite-clause ::num-field
  [[_ _ id :as clause] mappings]
  (let [remapped (get-in mappings [:fields id])]
    (assert (pos-int? remapped))
    (assoc clause 2 remapped)))

(defmethod rewrite-clause ::source-table-entry
  [[_ id :as source-table-entry] mappings]
  (let [remapped (get-in mappings [:tables id])]
    (assert (pos-int? remapped))
    (assoc source-table-entry 1 remapped)))

;;;; Public?

(defn rewrite-mappings
  "Return transform with remapped ids. Checks for whether mappings _should_ be rewritten should be done upstream."
  [transform new-table-id]
  (assert (-> transform :source_type (= :mbql))
          "Supporting only mbql sourced transforms")
  (assert (-> transform :source :query :stages (nth 0) :source-table pos-int?)
          "Supporting only transforms with source table")
  (let [source (:source transform)
        query (:query source)
        old-table-id (query-table-id query)
        mappings (mappings old-table-id new-table-id)
        remapped (walk/postwalk #(rewrite-clause % mappings) query)]
    (assoc-in transform [:source :query] remapped)))
