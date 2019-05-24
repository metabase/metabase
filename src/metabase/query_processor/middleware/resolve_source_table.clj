(ns metabase.query-processor.middleware.resolve-source-table
  "Fetches Tables corresponding to any `:source-table` IDs anywhere in the query."
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ^{:arglists '([x])} positive-int? (every-pred integer? pos?))

(defn- check-all-source-table-ids-are-valid
  "Sanity check: Any non-positive-integer value of `:source-table` should have been resolved by now. The
  `resolve-card-id-source-tables` middleware should have already taken care of it."
  [query]
  (mbql.u/match-one query
    (m :guard (every-pred map? :source-table (comp (complement positive-int?) :source-table)))
    (throw
     (ex-info
         (str (tru "Invalid :source-table ''{0}'': should be resolved to a Table ID by now." (:source-table m)))
       {:form m}))))

(s/defn ^:private query->source-table-ids :- (s/maybe (su/non-empty #{su/IntGreaterThanZero}))
  "Fetch a set of all `:source-table` IDs anywhere in `query`."
  [query]
  (some->
   (mbql.u/match query
     (m :guard (every-pred map? (comp positive-int? :source-table)))
     ;; Recursively look in the rest of `m` for any other source tables
     (cons
      (:source-table m)
      (filter some? (recur (dissoc m :source-table)))))
   flatten
   set))

(s/defn ^:private fetch-tables :- [(class Table)]
  [table-ids :- (su/non-empty #{su/IntGreaterThanZero})]
  (db/select (into [Table] qp.store/table-columns-to-fetch)
    :db_id (u/get-id (qp.store/database))
    :id    [:in (set table-ids)]))

(s/defn ^:private check-all-source-tables-fetched
  "Make sure all the source tables we wanted to fetch have been fetched. Any missing IDs are either Tables that don't
  exist, or from the wrong DB."
  [source-table-ids :- (su/non-empty #{su/IntGreaterThanZero}), fetched-tables :- [(class Table)]]
  (let [fetched-ids (set (map :id fetched-tables))]
    (doseq [source-table-id source-table-ids]
      (when-not (contains? fetched-ids source-table-id)
        (throw
         (ex-info (str (tru "Cannot run query: source table {0} does not exist, or belongs to a different database."
                            source-table-id))
           {:source-table source-table-id}))))))

(defn- resolve-source-table*
  "Validate that all "
  [query]
  (check-all-source-table-ids-are-valid query)
  (when-let [source-table-ids (query->source-table-ids query)]
    (let [fetched-tables (fetch-tables source-table-ids)]
      (check-all-source-tables-fetched source-table-ids fetched-tables)
      ;; ok, now save each of the fetched Tables
      (doseq [table fetched-tables]
        (qp.store/store-table! table)))))

(defn resolve-source-tables
  "Middleware that will take any `:source-table`s (integer IDs) anywhere in the query and fetch and save the
  corresponding Table in the Query Processor Store."
  [qp]
  (fn [query]
    (resolve-source-tables query)
    (qp query)))
