(ns metabase.query-processor.middleware.cache-backend.db
  (:require
   [honey.sql :as sql]
   [java-time :as t]
   [metabase.db :as mdb]
   [metabase.models.query-cache :refer [QueryCache]]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan2.connection :as t2.connection]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement ResultSet Types)))

(set! *warn-on-reflection* true)

(defn- seconds-ago [n]
  (let [[unit n] (if-not (integer? n)
                   [:millisecond (long (* 1000 n))]
                   [:second n])]
    (u.date/add (t/offset-date-time) unit (- n))))

(def ^:private ^{:arglists '([])} cached-results-query-sql
  ;; this is memoized for a given application DB so we can deliver cached results EXTRA FAST and not have to spend an
  ;; extra microsecond compiling the same exact query every time. :shrug:
  ;;
  ;; Since application DB can change at run time (during tests) it's not just a plain delay
  (let [f (memoize (fn [_db-type quoting-style]
                     (first (sql/format {:select   [:results]
                                         :from     [:query_cache]
                                         :where    [:and
                                                    [:= :query_hash [:raw "?"]]
                                                    [:>= :updated_at [:raw "?"]]]
                                         :order-by [[:updated_at :desc]]
                                         :limit    [:inline 1]}
                                        {:quoted  true
                                         :dialect quoting-style}))))]
    (fn []
      (f (mdb/db-type) (db/quoting-style)))))

(defn- prepare-statement
  ^PreparedStatement [^Connection conn query-hash max-age-seconds]
  (let [stmt (.prepareStatement conn ^String (cached-results-query-sql)
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
  ;; VERY IMPORTANT! Open up a connection (which internally binds [[toucan2.connection/*current-connectable*]] so it
  ;; will get reused elsewhere for the duration of results reduction, otherwise we can potentially end up deadlocking if
  ;; we need to acquire another connection for one reason or another, such as recording QueryExecutions
  (t2/with-connection [conn]
    (with-open [stmt (prepare-statement conn query-hash max-age-seconds)
                rs   (.executeQuery stmt)]
      (assert (= t2.connection/*current-connectable* conn))
      (if-not (.next rs)
        (respond nil)
        (with-open [is (.getBinaryStream rs 1)]
          (respond is))))))

(defn- purge-old-cache-entries!
  "Delete any cache entries that are older than the global max age `max-cache-entry-age-seconds` (currently 3 months)."
  [max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (log/tracef "Purging old cache entries.")
  (try
    (t2/delete! (t2/table-name QueryCache)
                :updated_at [:<= (seconds-ago max-age-seconds)])
    (catch Throwable e
      (log/error e (trs "Error purging old cache entries"))))
  nil)

(defn- save-results!
  "Save the `results` of query with `query-hash`, updating an existing QueryCache entry if one already exists, otherwise
  creating a new entry."
  [^bytes query-hash ^bytes results]
  (log/debug (trs "Caching results for query with hash {0}." (pr-str (i/short-hex-hash query-hash))))
  (try
    (or (pos? (t2/update! QueryCache {:query_hash query-hash}
                          {:updated_at (t/offset-date-time)
                           :results    results}))
        (first (t2/insert-returning-instances! QueryCache
                                               :updated_at (t/offset-date-time)
                                               :query_hash query-hash
                                               :results    results)))
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
