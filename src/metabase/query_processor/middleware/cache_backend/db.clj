(ns metabase.query-processor.middleware.cache-backend.db
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.models.query-cache :refer [QueryCache]]
            [metabase.query-processor.middleware.cache-backend.interface :as i]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [trs]]]
            [toucan.db :as db])
  (:import java.sql.ResultSet
           javax.sql.DataSource))

(defn- ^DataSource datasource []
  (:datasource (toucan.db/connection)))

(defn- seconds-ago [n]
  (let [[unit n] (if-not (integer? n)
                   [:millisecond (long (* 1000 n))]
                   [:second n])]
    (u.date/add (t/offset-date-time) unit (- n))))

(defn- cached-results-query [query-hash max-age-seconds]
  (hsql/format {:select   [:results]
                :from     [QueryCache]
                :where    [:and
                           [:= :query_hash query-hash]
                           [:>= :updated_at (seconds-ago max-age-seconds)]]
                :order-by [[:updated_at :desc]]
                :limit    1}
    :quoting (db/quoting-style)))

(defn- cached-results [query-hash max-age-seconds respond]
  (let [[sql _ t] (cached-results-query query-hash max-age-seconds)]
    (with-open [conn (.getConnection (datasource))
                stmt (doto (.prepareStatement conn sql
                                              ResultSet/TYPE_FORWARD_ONLY
                                              ResultSet/CONCUR_READ_ONLY
                                              ResultSet/CLOSE_CURSORS_AT_COMMIT)
                       (.setFetchDirection ResultSet/FETCH_FORWARD)
                       (.setBytes 1 query-hash)
                       (.setObject 2 t java.sql.Types/TIMESTAMP_WITH_TIMEZONE)
                       (.setMaxRows 1))]
      (with-open [rs (.executeQuery stmt)]
        (if-not (.next rs)
          (respond nil)
          (with-open [is (.getBinaryStream rs 1)]
            (respond is)))))))

(defn- purge-old-cache-entries!
  "Delete any cache entries that are older than the global max age `max-cache-entry-age-seconds` (currently 3 months)."
  [max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (do
    (log/tracef "Purging old cache entries.")
    (try
      (db/simple-delete! QueryCache
        :updated_at [:<= (seconds-ago max-age-seconds)])
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
          :updated_at (t/offset-date-time)
          :results    results)
        (db/insert! QueryCache
          :updated_at (t/offset-date-time)
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
