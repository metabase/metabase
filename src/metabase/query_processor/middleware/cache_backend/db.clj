(ns metabase.query-processor.middleware.cache-backend.db
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
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

;; NOTE: the result bytes MUST be materialized inside the query (via `select-one-fn`), not after the
;; row is returned. On H2 app-dbs `:results` comes back as a lazy `JdbcBlob` tied to the open
;; connection; reading it once the connection has closed throws "object is already closed", which the
;; cache middleware swallows as a cache miss - silently disabling caching on H2.

(defn- ->instant
  "Coerce an app-db timestamp to an `Instant` for comparison. The app-db driver may return `:updated_at`
  as a `LocalDateTime` (MySQL/MariaDB, stored in UTC), an `OffsetDateTime`/`ZonedDateTime` (H2/Postgres),
  or a `java.util.Date`. `t/before?` throws on mixed temporal classes, so normalize first."
  ^java.time.Instant [t]
  (condp instance? t
    java.time.Instant       t
    java.time.LocalDateTime (.toInstant ^java.time.LocalDateTime t java.time.ZoneOffset/UTC)
    java.util.Date          (.toInstant ^java.util.Date t)
    (t/instant t)))

(defn select-cache
  "Return a cache entry for `query-hash` relative to `cutoff` as a map with `:bytes` and `:stale?`, or
  nil if no usable entry exists.

  By default (`allow-stale?` falsey) only a fresh entry (newer than `cutoff`) is returned and an
  expired one is treated as a miss so the caller re-runs the query - so the SQL filters by age and
  `:stale?` is always false. When `allow-stale?` is true the most recent entry is returned even when
  expired, flagged `:stale?` accordingly; opting-in callers MUST refresh stale results themselves."
  [query-hash cutoff allow-stale?]
  (when-let [{:keys [bytes updated_at]}
             (t2/select-one-fn (fn [row]
                                 {:bytes      (results-as-bytes row)
                                  :updated_at (:updated_at row)})
                               :model/QueryCache
                               {:select   [:results :updated_at]
                                :where    (cond-> [:and [:= :query_hash query-hash]]
                                            (not allow-stale?) (conj [:>= :updated_at cutoff]))
                                :order-by [[:updated_at :desc]]})]
    {:bytes  bytes
     ;; In the default path the SQL already guarantees `updated_at >= cutoff`, so the entry is fresh -
     ;; short-circuit to avoid the temporal comparison entirely. Only the opt-in stale path compares.
     :stale? (boolean (and allow-stale? (.isBefore (->instant updated_at) (->instant cutoff))))}))

(defn fetch-cache-stmt-ttl
  "Fetch a cache entry for :ttl caching strategy. Returns a map with `:bytes` and `:stale?`,
  or nil when no entry exists."
  [strategy query-hash]
  (if-not (:avg-execution-ms strategy)
    (log/debugf "Caching strategy %s needs :avg-execution-ms to work" (pr-str strategy))
    (let [max-age-ms (* (:multiplier strategy)
                        (:avg-execution-ms strategy))
          cutoff     (cond-> (ms-ago max-age-ms)
                       (:invalidated-at strategy) (t/max (:invalidated-at strategy)))]
      (select-cache query-hash cutoff (:allow-stale? strategy)))))

(defenterprise fetch-cache-stmt
  "Returns prepared statement for a given strategy and query hash - on EE. Returns `::oss` on OSS."
  metabase-enterprise.cache.strategies
  [strategy hash]
  (when (= :ttl (:type strategy))
    (fetch-cache-stmt-ttl strategy hash)))

(defn- cached-results [query-hash strategy respond]
  (if-let [{:keys [bytes stale?]} (fetch-cache-stmt strategy query-hash)]
    (with-open [is (encryption/maybe-decrypt-stream (ByteArrayInputStream. bytes))]
      (respond is (boolean stale?)))
    (respond nil false)))

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
      (app-db/update-or-insert! :model/QueryCache {:query_hash query-hash}
                                (constantly {:updated_at timestamp
                                             :results    final-results}))
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
