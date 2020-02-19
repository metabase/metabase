(ns metabase.query-processor.middleware.cache-backend.db
  (:require [clojure.tools.logging :as log]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn- seconds-ago-honeysql-form
  "Generate appropriate HoneySQL for `now() - seconds` for the application DB. `seconds` is not neccessarily an
  integer! It can be floating-point for fractional seconds."
  [seconds]
  {:pre [(number? seconds)]}
  (sql.qp/add-interval-honeysql-form
   (mdb/db-type)
   (sql.qp/current-datetime-honeysql-form (mdb/db-type))
   (- seconds)
   :second))

(defn- cached-results ^bytes [^bytes query-hash max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (u/prog1 (db/select-one-field :results QueryCache
             :query_hash query-hash
             :updated_at [:>= (seconds-ago-honeysql-form max-age-seconds)])
    (log/debug (trs "Found cached result for query with hash {0}." (pr-str (i/short-hex-hash query-hash))))))

(defn- purge-old-cache-entries!
  "Delete any cache entries that are older than the global max age `max-cache-entry-age-seconds` (currently 3 months)."
  [max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (do
    (log/tracef "Purging old cache entries.")
    (try
      (db/simple-delete! QueryCache
        :updated_at [:<= (seconds-ago-honeysql-form max-age-seconds)])
      (catch Throwable e
        (log/error e (trs "Error purging old cache entries")))))
  nil)

(defn- save-results!
  "Save the `results` of query with `query-hash`, updating an existing QueryCache entry if one already exists, otherwise
  creating a new entry."
  [^bytes query-hash ^bytes results]
  (log/debug (trs "Caching results for query with hash {0}." (pr-str (i/short-hex-hash query-hash))))
  (try
    (or (db/update-where! QueryCache {:query_hash query-hash}
          :updated_at :%now
          :results    results)
        (db/insert! QueryCache
          :updated_at :%now
          :query_hash query-hash
          :results    results))
    (catch Throwable e
      (log/error e (trs "Error saving query results to cache."))))
  nil)

(defmethod i/cache-backend :db
  [_]
  (reify i/CacheBackend
    (cached-results [_ query-hash max-age-seconds]
      (cached-results query-hash max-age-seconds))

    (save-results! [_ query-hash results]
      (save-results! query-hash results)
      nil)

    (purge-old-entries! [_ max-age-seconds]
      (purge-old-cache-entries! max-age-seconds))))
