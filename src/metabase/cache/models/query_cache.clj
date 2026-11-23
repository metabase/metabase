(ns metabase.cache.models.query-cache
  "A model used to cache query results in the database."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.cache.db :as cache.db]
   [metabase.cache.schema :as cache.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/QueryCache [_model] :query_cache)
(methodical/defmethod t2/primary-keys :model/QueryCache [_model] [:query_hash])

(doto :model/QueryCache
  (derive :metabase/model)
  (derive :hook/updated-at-timestamped?))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn delete-query-caches!
  "Delete the QueryCache entries with `query-hashes` in one transaction, `mdb/delete-partition-size` per statement."
  [query-hashes :- [:sequential bytes?]]
  (when (seq query-hashes)
    (t2/with-transaction [_conn]
      (run! (comp cache.db/delete-query-caches! vec) (partition-all mdb/delete-partition-size query-hashes)))))

(mu/defn claim-refresh-lease! :- :int
  "Set `refresh_started_at` of the QueryCache entry for `query-hash` to `started-at` if its lease (defaulting to
  `lease-free-sentinel`) is older than `lease-cutoff`, in one statement, returning the number updated."
  [query-hash          :- bytes?
   lease-free-sentinel :- ::cache.schema/temporal
   lease-cutoff        :- ::cache.schema/temporal
   started-at          :- ::cache.schema/temporal]
  (cache.db/claim-query-cache-refresh-lease! query-hash lease-free-sentinel lease-cutoff started-at))

(mu/defn delete-query-caches-for-cleanup!
  "Delete the QueryCache entries last updated at or before `updated-before`."
  [updated-before :- ::cache.schema/temporal]
  (cache.db/delete-query-caches-updated-before! updated-before))

(mu/defn upsert-query-cache!
  "Insert or update the QueryCache entry for `query-hash` with `results` and `timestamp`, clearing its refresh lease,
  and return its primary key, the hash bytes."
  [query-hash :- bytes?
   timestamp  :- ::cache.schema/temporal
   results    :- bytes?]
  (cache.db/upsert-query-cache! query-hash timestamp results))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/QueryCache [_model]
  {:skip? true})
