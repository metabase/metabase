(ns metabase.query-processor.middleware.cache-backend.db
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase.db :as mdb]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.sql.ResultSet
           javax.sql.DataSource))

(defn- ^DataSource datasource []
  (:datasource (toucan.db/connection)))

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

(defn- cached-results-sql [max-age-seconds]
  (first (hsql/format {:select   [:results]
                       :from     [QueryCache]
                       :where    [:and
                                  [:= :query_hash (hsql/raw "?")]
                                  [:>= :updated_at (seconds-ago-honeysql-form max-age-seconds)]]
                       :order-by [[:updated_at :desc]]
                       :limit    1}
           :quoting (db/quoting-style))))

(defn- cached-results [query-hash max-age-seconds respond]
  (with-open [conn (.getConnection (datasource))
              stmt (doto (.prepareStatement conn (cached-results-sql max-age-seconds)
                                            ResultSet/TYPE_FORWARD_ONLY
                                            ResultSet/CONCUR_READ_ONLY
                                            ResultSet/CLOSE_CURSORS_AT_COMMIT)
                     (.setFetchDirection ResultSet/FETCH_FORWARD)
                     (.setBytes 1 query-hash)
                     (.setMaxRows 1))
              rs   (.executeQuery stmt)]
    (if-not (.next rs)
      (respond nil)
      (with-open [is (.getBinaryStream rs 1)]
        (respond is)))))

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
    (cached-results [_ query-hash max-age-seconds respond]
      (cached-results query-hash max-age-seconds respond))

    (save-results! [_ query-hash is]
      (save-results! query-hash is)
      nil)

    (purge-old-entries! [_ max-age-seconds]
      (purge-old-cache-entries! max-age-seconds))))
