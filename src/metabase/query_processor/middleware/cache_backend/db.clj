(ns metabase.query-processor.middleware.cache-backend.db
  (:require
   [java-time.api :as t]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util.date-2 :as u.date]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- ms-ago [n]
  (u.date/add (t/offset-date-time) :millisecond (- n)))

(defn- seconds-ago [n]
  (ms-ago (long (* 1000 n))))

(defmulti results-as-bytes
  "Handles converting the results db column into a byte array"
  {:arglists '([cached])}
  (comp type :results))

;; H2 returns a blob type
(defmethod results-as-bytes org.h2.jdbc.JdbcBlob
  [{:keys [^org.h2.jdbc.JdbcBlob results]}]
  (.getBytes results 1 (.length results)))

;; MySQL/Mariadb/Postgresql return a byte array
(defmethod results-as-bytes :default
  [{:keys [results]}]
  results)

(defn select-cache
  "Select the result form the cache"
  [query-hash updated-at]
  (t2/select-one-fn results-as-bytes :model/QueryCache
                    {:select [:results]
                     :where [:and
                             [:= :query_hash query-hash]
                             [:>= :updated_at updated-at]]
                     :order-by [[:updated_at :desc]]}))

(defn fetch-cache-stmt-ttl
  "Make a prepared statement for :ttl caching strategy"
  [strategy query-hash]
  (if-not (:avg-execution-ms strategy)
    (log/debugf "Caching strategy %s needs :avg-execution-ms to work" (pr-str strategy))
    (let [max-age-ms     (* (:multiplier strategy)
                            (:avg-execution-ms strategy))
          invalidated-at (t/max (ms-ago max-age-ms) (:invalidated-at strategy))]
      (select-cache query-hash invalidated-at))))

(defenterprise fetch-cache-stmt
  "Returns prepared statement for a given strategy and query hash - on EE. Returns `::oss` on OSS."
  metabase-enterprise.cache.strategies
  [strategy hash]
  (when (= :ttl (:type strategy))
    (fetch-cache-stmt-ttl strategy hash)))

(defn- cached-results [query-hash strategy respond]
  (if-let [cached (fetch-cache-stmt strategy query-hash)]
    (with-open [is (encryption/maybe-decrypt-stream (ByteArrayInputStream. cached))]
      (respond is))
    (respond nil)))

(defn- purge-old-cache-entries!
  "Delete any cache entries that are older than the global max age `max-cache-entry-age-seconds` (currently 3 months)."
  [max-age-seconds]
  {:pre [(number? max-age-seconds)]}
  (log/trace "Purging old cache entries.")
  (try
    (t2/delete! (t2/table-name :model/QueryCache)
                :updated_at [:<= (seconds-ago max-age-seconds)])
    (catch Throwable e
      (log/error e "Error purging old cache entries")))
  nil)

(defn- save-results!
  "Save the `results` of query with `query-hash`, updating an existing QueryCache entry if one already exists, otherwise
  creating a new entry."
  [^bytes query-hash ^bytes results]
  (log/debugf "Caching results for query with hash %s." (pr-str (i/short-hex-hash query-hash)))
  (let [final-results (encryption/maybe-encrypt-for-stream results)
        timestamp     (t/offset-date-time)]
    (try
      (or (pos? (t2/update! :model/QueryCache {:query_hash query-hash}
                            {:updated_at timestamp
                             :results    final-results}))
          (first (t2/insert-returning-instances! :model/QueryCache
                                                 :updated_at timestamp
                                                 :query_hash query-hash
                                                 :results final-results)))
      (catch Throwable e
        (log/error e "Error saving query results to cache.")))
    nil))

(defmethod i/cache-backend :db
  [_]
  (reify i/CacheBackend
    (cached-results [_ query-hash strategy respond]
      (cached-results query-hash strategy respond))

    (save-results! [_ query-hash is]
      (save-results! query-hash is)
      nil)

    (purge-old-entries! [_ max-age-seconds]
      (purge-old-cache-entries! max-age-seconds))))
