(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations.
   Uses namespaced keywords with :ref/ prefix to avoid collisions with real MBQL queries."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.lib.core :as lib]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ============================================================================
;; Import: Convert representation refs to Metabase IDs
;; ============================================================================

(defn resolve-source-table
  "Resolves refs in the raw MBQL map, replacing them with IDs for import."
  [source-table default-db ref-index]
  (cond
    ;; ref to another card/question:
    (v0-common/ref? source-table)
    (str "card__" (-> ref-index
                      (v0-common/lookup-id source-table)
                      (v0-common/ensure-not-nil)))

    ;; map with database ref - resolve database and lookup table
    (v0-common/table-ref? source-table)
    (let [db-id (-> ref-index
                    (v0-common/lookup-entity (:database source-table default-db))
                    (v0-common/ensure-not-nil)
                    (v0-common/ensure-correct-type :database)
                    :id)
          table-id (t2/select-one-fn :id :model/Table
                                     :db_id db-id
                                     :schema (:schema source-table)
                                     :name (:table source-table))]
      (v0-common/ensure-not-nil table-id))

    ;; Not a ref -- leave it be
    :else
    source-table))

(defn replace-source-tables
  "Resolves refs in the raw MBQL map, replacing them with IDs for import."
  [mbql-query default-db ref-index]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (:source-table node))
       (update node :source-table resolve-source-table default-db ref-index)
       node))
   mbql-query))

(defn replace-fields
  "Resolves field refs in MBQL, converting maps to [:field id] vectors for import."
  [mbql-query default-db ref-index]
  (walk/postwalk
   (fn [node]
     (if (v0-common/field-ref? node)
       ;; It's a field map - resolve it to [:field id]
       (let [db-id (-> ref-index
                       (v0-common/lookup-entity (:database node default-db))
                       (v0-common/ensure-not-nil)
                       (v0-common/ensure-correct-type :database)
                       :id)
             table-id (v0-common/ensure-not-nil
                       (t2/select-one-fn :id :model/Table
                                         :db_id db-id
                                         :schema (:schema node)
                                         :name (:table node)))
             field-id (v0-common/ensure-not-nil
                       (t2/select-one-fn :id :model/Field
                                         :table_id table-id
                                         :name (:field node)))]
         ;; use mbql5
         [:field {} field-id])
       node))
   mbql-query))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure."
  [{:keys [query database]} ref-index]
  (let [database-id (lookup/lookup-database-id ref-index database)]
    (if (string? query)
      {:lib/type :mbql/query
       :database database-id
       :stages [{:lib/type :mbql.stage/native
                 :template-tags {}
                 :native query}]}

      (let [resolved-lib (-> query
                             (replace-source-tables database ref-index)
                             #_(replace-source-cards  ref-index)
                             (replace-fields database ref-index))]
        {:lib/type :mbql/query
         :database database-id
         :stages resolved-lib}))))

;; ============================================================================
;; Export: Convert Metabase IDs to representation refs
;; ============================================================================

(defn- table-ref
  "Convert a table ID to a representation ref map."
  [table-id default-db]
  (when-some [t (t2/select-one :model/Table table-id)]
    (let [db (v0-common/->ref (:db_id t) :database)]
      (cond-> {:database db
               :schema (:schema t)
               :table (:name t)}

        (= db default-db)
        (dissoc :database)

        :always
        u/remove-nils))))

(defn- field-ref
  "Convert a field id to a representation ref map."
  [field-id default-db]
  (let [field (t2/select-one :model/Field field-id)
        tr (table-ref (:table_id field) default-db)]
    (assoc tr :field (:name field))))

(defmulti export-entity
  "This is a hack working around the fact that our export code flow doesn't currently
  keep track of things like refs."
  ^{:arglists '([t2-entity])}
  identity)

(defn id->card-ref
  "Take a card ID and turn it into a ref to the card."
  [id]
  (let [rep (export-entity (t2/select-one :model/Card :id id))]
    (str "ref:" (:name rep))))

(defn- card-ref
  "Convert a card reference string (e.g. 'card__123') to a representation ref."
  [s]
  (let [[_type id] (str/split s #"__")
        id (Long/parseLong id)]
    (id->card-ref id)))

(defn ->ref-source-table
  "Convert source_table from IDs to representation refs for export."
  [query default-db]
  (walk/postwalk
   (fn [node]
     (cond
       (not (and (map? node)
                 (:source-table node)))
       node

       (string? (:source-table node))
       (update node :source-table card-ref)

       (number? (:source-table node))
       (update node :source-table table-ref default-db)

       :else
       (throw (ex-info "Unknown source table type" {:query query
                                                    :source-table node}))))
   query))

(defn ->ref-source-card
  "Convert source_card from IDs to representation refs for export."
  [query]
  (walk/postwalk
   (fn [node]
     (cond
       (not (and (map? node)
                 (:source-card node)))
       node

       (number? (:source-card node))
       (update node :source-card id->card-ref)

       :else
       (throw (ex-info "Unknown source table type" {:query query
                                                    :source-table node}))))
   query))

(defn ->ref-database
  "Convert database from ID to representation ref for export."
  [query]
  (if-some [db (:database query)]
    (assoc query :database (v0-common/->ref db :database))
    query))

(defn- field?
  "Is x a field? ex: `[:field 34 {}]`"
  [x]
  (and (vector? x)
       (or (= :field (first x))
           (= "field" (first x)))))

(defn- field-id
  "Get the field id from a field vector."
  [[_ a b :as field]]
  (cond
    (or (int? a) (string? a)) ;; mbql4, id in second place
    a

    (or (int? b) (string? b)) ;; mbql5, id in third place
    b

    :else
    (throw (ex-info "Cannot get the id from non-field."
                    {:field field}))))

(defn ->ref-fields
  "Convert fields from [:field id] vectors to representation ref maps for export."
  [query default-db]
  (walk/postwalk
   (fn [node]
     (if (field? node)
       (let [id (field-id node)]
         (cond
           ;; if it's a string, it's referring to a custom field, so we leave it
           (string? id)
           node

           (number? id)
           (field-ref id default-db)))
       node))
   query))

(defn patch-refs-for-export
  "Take a query and convert dependency ids to refs for export.

  It currently updates database, source table, and fields."
  [query]
  (let [query (->ref-database query)]
    (-> query
        (->ref-source-table (:database query))
        ->ref-source-card
        (->ref-fields (:database query)))))

(defn export-dataset-query
  "Export a dataset query to representation compatible format.
  Will have database (as a ref) and query."
  [query]
  (let [patched-query (patch-refs-for-export query)]
    {:database (:database patched-query)
     :query (if (lib/native-only-query? query)
              (lib/raw-native-query query)
              (:stages patched-query))}))
