(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations.
   Uses namespaced keywords with :ref/ prefix to avoid collisions with real MBQL queries."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ============================================================================
;; Import: Convert representation refs to Metabase IDs
;; ============================================================================

(defn resolve-source-table
  "Resolves refs in the raw MBQL map, replacing them with IDs for import."
  [source-table ref-index]
  (cond
    ;; ref to another card/question:
    (v0-common/ref? source-table)
    (str "card__" (-> ref-index
                      (v0-common/lookup-id source-table)
                      (v0-common/ensure-not-nil)))

    ;; map with database ref - resolve database and lookup table
    (v0-common/table-ref? source-table)
    (let [db-id (-> ref-index
                    (v0-common/lookup-entity (:database source-table))
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
  [mbql-query ref-index]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (:source-table node))
       (update node :source-table resolve-source-table ref-index)
       node))
   mbql-query))

(defn replace-fields
  "Resolves field refs in MBQL, converting maps to [:field id] vectors for import."
  [mbql-query ref-index]
  (walk/postwalk
   (fn [node]
     (if (v0-common/field-ref? node)
       ;; It's a field map - resolve it to [:field id]
       (let [db-id (-> ref-index
                       (v0-common/lookup-entity (:database node))
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
         [:field field-id])
       node))
   mbql-query))

;; ============================================================================
;; Export: Convert Metabase IDs to representation refs
;; ============================================================================

(defn- table-ref
  "Convert a table ID to a representation ref map."
  [table-id]
  (when-some [t (t2/select-one :model/Table table-id)]
    (-> {:database (v0-common/->ref (:db_id t) :database)
         :schema (:schema t)
         :table (:name t)}
        u/remove-nils)))

(defn- field-ref
  "Convert a field id to a representation ref map."
  [field-id]
  (let [field (t2/select-one :model/Field field-id)
        tr (table-ref (:table_id field))]
    (assoc tr :field (:name field))))

(defn id->card-ref
  [id]
  (let [rep (export/export-entity (t2/select-one :model/Card :id id))]
    (str "ref:" (:ref rep))))

(defn- card-ref
  "Convert a card reference string (e.g. 'card__123') to a representation ref."
  [s]
  (let [[_type id] (str/split s #"__")
        id (Long/parseLong id)]
    (id->card-ref id)))

(defn ->ref-source-table
  "Convert source_table from IDs to representation refs for export."
  [query]
  (walk/postwalk
   (fn [node]
     (cond
       (not (and (map? node)
                 (:source-table node)))
       node

       (string? (:source-table node))
       (update node :source-table card-ref)

       (number? (:source-table node))
       (update node :source-table table-ref)

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

(defn ->ref-fields
  "Convert fields from [:field id] vectors to representation ref maps for export."
  [query]
  (walk/postwalk
   (fn [node]
     (if (field? node)
       (let [[_ id] node]
         (cond
           ;; if it's a string, it's referring to a custom field, so we leave it
           (string? id)
           node

           (number? id)
           (field-ref id)

           :else ;; ???: should we fail here?
           node))
       node))
   query))

(defn patch-refs-for-export
  "Take a query and convert dependency ids to refs for export.

  It currently updates database, source table, and fields."
  [query]
  (-> query
      ->ref-database
      ->ref-source-table
      ->ref-fields))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure."
  [{:keys [query mbql_query lib_query database] :as representation} ref-index]
  (let [database-id (v0-common/resolve-database-id database ref-index)]
    (cond
      ;; Native SQL query - simple case
      query
      {:type :native
       :native {:query query}
       :database database-id}

      ;; MBQL query - check if it's a ref or embedded map
      mbql_query
      (let [resolved-mbql (-> mbql_query
                              (replace-source-tables ref-index)
                              (replace-fields ref-index))]
        {:type :query
         :database database-id
         :query resolved-mbql})

      lib_query
      (let [resolved-lib (-> lib_query
                             (replace-source-tables ref-index)
                             (replace-fields ref-index))]
        {:lib/type :mbql/query
         :database database-id
         :stages resolved-lib})

      ;; sanity check
      :else
      (throw (ex-info "Question must have either 'query' or 'mbql_query'"
                      {:representation representation})))))

(defn export-dataset-query
  [query]
  (let [query (patch-refs-for-export query)]
    (cond-> {:database (:database query)}

      (= :native (:type query))
      (assoc :query (-> query :native :query))

      (= :query (:type query))
      (assoc :mbql_query (:query query))

      (= :mbql/query (:lib/type query))
      (assoc :lib_query (:stages query)))))
