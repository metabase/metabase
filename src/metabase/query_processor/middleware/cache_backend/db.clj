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
  (:import [java.sql Connection PreparedStatement ResultSet Types]
           javax.sql.DataSource))

(defn- ^DataSource datasource []
  (:datasource (toucan.db/connection)))

(defn- seconds-ago [n]
  (let [[unit n] (if-not (integer? n)
                   [:millisecond (long (* 1000 n))]
                   [:second n])]
    (u.date/add (t/offset-date-time) unit (- n))))

(def ^:private cached-results-query-sql
  (delay (first (hsql/format {:select   [:results]
                              :from     [QueryCache]
                              :where    [:and
                                         [:= :query_hash (hsql/raw "?")]
                                         [:>= :updated_at (hsql/raw "?")]]
                              :order-by [[:updated_at :desc]]
                              :limit    1}
                  :quoting (db/quoting-style)))))

(defn- prepare-statement
  ^PreparedStatement [^Connection conn query-hash max-age-seconds]
  (let [stmt (.prepareStatement conn ^String @cached-results-query-sql
                                ResultSet/TYPE_FORWARD_ONLY
                                ResultSet/CONCUR_READ_ONLY
                                ResultSet/CLOSE_CURSORS_AT_COMMIT)]
    (try
      (doto stmt
        (.setFetchDirection ResultSet/FETCH_FORWARD)
        (.setBytes 1 query-hash)
        (.setObject 2 (seconds-ago max-age-seconds) Types/TIMESTAMP_WITH_TIMEZONE)
        (.setMaxRows 1))
      (catch Throwable e
        (log/error e (trs "Error preparing statement to fetch cached query results"))
        (.close stmt)
        (throw e)))))



(defn- cached-results [query-hash max-age-seconds respond]
  (with-open [conn (.getConnection (datasource))
              stmt (prepare-statement conn query-hash max-age-seconds)
              rs   (.executeQuery stmt)]
    ;; VERY IMPORTANT! Bind `*db-connection*` so it will get reused elsewhere for the duration of results reduction,
    ;; otherwise we can potentially end up deadlocking if we need to acquire another connection for one reason or
    ;; another, such as recording QueryExecutions
    (binding [db/*db-connection* {:connection conn}]
      (if-not (.next rs)
        (respond nil)
        (with-open [is (.getBinaryStream rs 1)]
          (respond is))))))

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
