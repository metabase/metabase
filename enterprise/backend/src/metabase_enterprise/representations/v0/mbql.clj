(ns metabase-enterprise.representations.v0.mbql
  "MBQL transformations for import/export of representations.
   Uses namespaced keywords with :ref/ prefix to avoid collisions with real MBQL queries."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
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
  [mbql-query ref-index]
  (let [table-ref (:source-table mbql-query)
        table-id (cond
                   ;; ref to another card/question:
                   (v0-common/ref? table-ref)
                   (->> (v0-common/ref->id table-ref ref-index)
                        (str "card__"))
                   ;; map with database ref - resolve database and lookup table
                   (and (map? table-ref) (v0-common/ref? (:ref/database table-ref)))
                   (let [db-id (v0-common/ref->id (:ref/database table-ref) ref-index)

                         table-id
                         (t2/select-one-fn :id :model/Table
                                           :db_id db-id
                                           :schema (:ref/schema table-ref)
                                           :name (:ref/table table-ref))]
                     (when (nil? table-id)
                       (throw (ex-info "Could not find matching table."
                                       {:table-ref table-ref})))
                     table-id)
                   ;; Not a ref -- leave it be
                   :else
                   table-ref)]
    (assoc mbql-query :source-table table-id)))

(defn resolve-fields
  "Resolves field refs in MBQL, converting maps to [:field id] vectors for import."
  [mbql-query ref-index]
  (walk/postwalk
   (fn [node]
     (if (and (map? node) (:ref/field node) (:ref/table node))
       ;; It's a field map - resolve it to [:field id]
       (let [db-id (v0-common/ref->id (:ref/database node) ref-index)
             table-id (t2/select-one-fn :id :model/Table
                                        :db_id db-id
                                        :schema (:ref/schema node)
                                        :name (:ref/table node))
             field-id (t2/select-one-fn :id :model/Field
                                        :table_id table-id
                                        :name (:ref/field node))]
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
    (-> {:ref/database (v0-common/->ref (:db_id t) :database)
         :ref/schema (:schema t)
         :ref/table (:name t)}
        u/remove-nils)))

(defn- card-ref
  "Convert a card reference string (e.g. 'card__123') to a representation ref."
  [s]
  (let [[_type id] (str/split s #"__")
        id (Long/parseLong id)
        rep (export/export-entity (t2/select-one :model/Card :id id))]
    (str "ref:" (:ref rep))))

(defn ->ref-source-table
  "Convert source_table from IDs to representation refs for export."
  [query]
  (if-some [st (-> query :query :source-table)]
    (cond
      (string? st)
      (assoc-in query [:query :source-table]
                (card-ref st))

      (number? st)
      (assoc-in query [:query :source-table]
                (table-ref st))

      :else
      (throw (ex-info "Unknown source table type" {:query query
                                                   :source-table st})))
    query))

(defn ->ref-database
  "Convert database from ID to representation ref for export."
  [query]
  (if-some [db (:database query)]
    (assoc query :database (v0-common/->ref db :database))
    query))

(defn ->ref-fields
  "Convert fields from [:field id] vectors to representation ref maps for export."
  [query]
  (walk/postwalk
   (fn [node]
     (if (and (vector? node)
              (or (= :field (first node))
                  (= "field" (first node))))
       (let [[_ id] node]
         (cond
           (string? id)
           node

           (number? id)
           (let [field (t2/select-one :model/Field id)
                 tr (table-ref (:table_id field))]
             (assoc tr :ref/field (:name field)))

           :else
           node))
       node))
   query))

(defn import-dataset-query
  "Returns Metabase's dataset_query format, given a representation.
   Converts representation format to Metabase's internal dataset_query structure."
  [{:keys [query mbql_query database] :as representation} ref-index]
  (let [database-id (v0-common/ref->id database ref-index)]
    (cond
      ;; Native SQL query - simple case
      query
      {:type :native
       :native {:query query}
       :database database-id}

      ;; MBQL query - check if it's a ref or embedded map
      mbql_query
      (let [resolved-mbql (-> (resolve-source-table mbql_query ref-index)
                              (resolve-fields ref-index))]
        {:type     :query
         :database database-id
         :query    resolved-mbql})

      ;; sanity check
      :else
      (throw (ex-info "Question must have either 'query' or 'mbql_query'"
                      {:representation representation})))))
