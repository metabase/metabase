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

(defn select-latest-cache-entry
  "The most recent cache entry for `query-hash` *regardless of TTL* (`query_hash` is the PK, so there's at most one):
  `{:results <raw bytes>, :updated-at <timestamp>}`, or nil if there's no entry. The caller compares `:updated-at`
  against the strategy's freshness boundary to decide whether to serve the entry, serve it stale while refreshing, or
  recompute (see [[strategy->invalidated-at]]).

  Reads the `results` blob *inside* the query reduction (via `select-one-fn`): an H2 `JdbcBlob` is only valid while
  its result set is open, so materializing the row first and reading the blob afterwards throws \"object is already
  closed\"."
  [query-hash]
  (t2/select-one-fn (fn [row]
                      {:results    (results-as-bytes row)
                       :updated-at (:updated_at row)})
                    [:model/QueryCache :results :updated_at]
                    :query_hash query-hash))

(defn invalidated-at-ttl
  "Freshness boundary for a `:ttl` strategy: cache entries with `updated_at` older than this are stale. Returns nil when
  the strategy is missing `:avg-execution-ms` (so a TTL can't be computed and nothing should be served from cache)."
  [strategy]
  (when-let [avg-execution-ms (:avg-execution-ms strategy)]
    ;; `:multiplier` can be fractional, so round to whole milliseconds (`ms-ago`/`u.date/add` want an integer)
    (let [boundary (ms-ago (long (* (:multiplier strategy) avg-execution-ms)))]
      (if-let [invalidated-at (:invalidated-at strategy)]
        (t/max boundary invalidated-at)
        boundary))))

(defenterprise strategy->invalidated-at
  "Freshness boundary timestamp for `strategy`: cache entries with `updated_at` strictly older than this are stale and
  must be refreshed. Returns nil when nothing can be served from cache for this strategy (e.g. on OSS for a non-`:ttl`
  strategy). EE overrides this to also handle `:duration` and `:schedule`."
  metabase-enterprise.cache.strategies
  [strategy]
  (when (= :ttl (:type strategy))
    (invalidated-at-ttl strategy)))

(def ^:private lease-free-sentinel
  "Substituted (via COALESCE) for a NULL `refresh_started_at` so that 'no refresh in progress' counts as a free lease.
  Any timestamp older than every realistic lease cutoff works."
  (t/offset-date-time "1970-01-01T00:00Z"))

(defn try-acquire-refresh-lease!
  "Atomically claim, across processes, the right to recompute the expired entry for `query-hash`, via a conditional
  UPDATE on `refresh_started_at`. Returns true iff this process won the lease (and so should recompute); false means
  another process is already refreshing it (and we should serve stale instead). A lease older than `lease-ms` is
  considered abandoned (e.g. the claimer crashed) and can be taken over.

  Updates the raw table, not the `:model/QueryCache` model: the model's `:hook/updated-at-timestamped?` before-update
  hook makes toucan2 run a non-atomic SELECT-then-UPDATE-by-PK, which would move the conditional lease check into the
  SELECT and let two processes both win. The raw table keeps this a single atomic conditional UPDATE; we set
  `updated_at` ourselves in place of the hook."
  [query-hash lease-ms]
  (let [now (t/offset-date-time)]
    (pos? (t2/update! (t2/table-name :model/QueryCache)
                      {:query_hash                                         query-hash
                       [:coalesce :refresh_started_at lease-free-sentinel] [:< (ms-ago lease-ms)]}
                      {:refresh_started_at now
                       :updated_at         now}))))

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
                                (constantly {:updated_at         timestamp
                                             :results            final-results
                                             :refresh_started_at nil}))
      (catch Throwable e
        (log/error e "Error saving query results to cache.")))
    nil))

(defmethod i/cache-backend :db
  [_]
  (reify i/CacheBackend
    (cached-results [_ query-hash respond]
      (if-let [{:keys [results updated-at]} (select-latest-cache-entry query-hash)]
        (with-open [is (encryption/maybe-decrypt-stream (ByteArrayInputStream. results))]
          (respond is updated-at))
        (respond nil nil)))

    (save-results! [_ query-hash is]
      (save-results! query-hash is)
      nil)

    (purge-old-entries! [_ max-age-seconds]
      (purge-old-cache-entries! max-age-seconds))

    (try-acquire-refresh-lease! [_ query-hash lease-ms]
      (try-acquire-refresh-lease! query-hash lease-ms))))
