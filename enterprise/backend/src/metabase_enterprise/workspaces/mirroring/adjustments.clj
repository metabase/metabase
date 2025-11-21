(ns metabase-enterprise.workspaces.mirroring.adjustments
  "Queries of mirrored entities have to be adjusted to point to mirrored resources.

  Motivation:
  X1 --produces-- T1 --used-in-query-by-- X2
  Let's include both transforms in a workspace. Copies would look as follows:
  X1c --produces-- T1c --used-in-query-by-- X2c
  
  The X2c is now dependent on T1c. Hence references to T1 in the X2c have to be adjusted to point to T1c instead."
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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

;; Later use single query instead
(defn- field-mappings
  "Return a map of {old-field-id new-field-id}. Matching against name. Name is unique."
  [old-table-id new-table-id]
  (let [old-fields (t2/select [:model/Field :id :name] :table_id old-table-id :active true)
        new-fields (t2/select [:model/Field :id :name] :table_id new-table-id :active true)
        old->new (u/for-map
                  [{:keys [id name]} old-fields]
                   (let [matching-id (:id (m/find-first (comp #{name} :name) new-fields))]
                     [id matching-id]))]
    (assert (= (count old-fields) (count new-fields) (count old->new)))
    old->new))

(defn- fields-mapping-rf
  [source->dest* [source-table-id dest-table-id]]
  (let [field-mappings* (field-mappings source-table-id dest-table-id)]
    (assert (empty? (set/intersection (set (keys field-mappings*))
                                      (set (keys (:fields source->dest*)))))
            "Duplicate field id")
    (update source->dest* :fields (fnil into {}) field-mappings*)))

;;;; Public?

;; TODO (lbrdnk 2025-11-20) This is naive and should by handled by _some_ lib function.
;; TODO (lbrdnk 2025-11-21) Moving to joins support I think we could use rather
;;                          `metabase.lib.walk.util/all-source-table-ids`. Leaving this here until things are settled.
(defn query-table-id
  "Get source table from query. Queries with source-card not supported."
  [query]
  (u/prog1 (some-> query :stages first :source-table)
    (assert (pos-int? <>))))

(defn mappings
  "For the mapping `source->dest` of form return mapping that includes fields.

  Inputs:
  - `source->dest`: map of a from {<source-table-id> <dest-table-id>},
  
  Returns mapping of mapping of {:tables {<source-table-id> <dest-table-id>}
                                 :fields {<source-field-id> <dest-field-id>}}"
  [source->dest]
  (assert (and (< 0 (count source->dest))
               (every? (fn [[k v]] (and (pos-int? k) (pos-int? v))) source->dest))
          "At least one table mapping expected")
  (reduce
   fields-mapping-rf
   {:tables source->dest}
   source->dest))

(defn rewrite-mappings
  "Return transform with remapped ids. Checks for whether mappings _should_ be rewritten should be done upstream.

  Input:
  - `transform`: model/Transform that is being duplicated
  - `source->dest`: mapping of {:tables {<source-table-id> <dest-table-id>}
                                :fields {<source-field-id> <dest-field-id>}}

  Returns transform with the query with remapped ids."
  [transform source->dest]
  (assert (-> transform :source_type (= :mbql))
          "Supporting only mbql sourced transforms")
  (assert (-> transform :source :query :stages (nth 0) :source-table pos-int?)
          "Supporting only transforms with source table")
  (update-in transform [:source :query]
             (partial walk/postwalk #(rewrite-clause % source->dest))))
