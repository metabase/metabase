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

(defmethod results-as-bytes java.sql.Blob
  [{:keys [^java.sql.Blob results]}]
  (.getBytes results 1 (int (.length results))))

;; MySQL/Mariadb/Postgresql return a byte array
(defmethod results-as-bytes :default
  [{:keys [results]}]
  results)

(defn select-cache-entry-since
  "The cache entry for `query-hash` written at or after `min-updated-at`: `{:results <raw bytes>, :updated-at
  <timestamp>}`, or nil if there is none (`query_hash` is the PK, so there's at most one row to consider). A nil
  `min-updated-at` matches the entry regardless of TTL; the caller then compares `:updated-at` against the strategy's
  freshness boundary itself (see [[strategy->invalidated-at]]).

  Both conditions are part of the query rather than checks on the returned row: a caller polling for another process's
  results would otherwise pay a full transfer of the stored blob on every miss. A row holding only a compute lease is
  not an entry, so `has_results` excludes it here too.

  Reads the `results` blob *inside* the query reduction (via `select-one-fn`): an H2 `JdbcBlob` is only valid while
  its result set is open, so materializing the row first and reading the blob afterwards throws \"object is already
  closed\"."
  [query-hash min-updated-at]
  (t2/select-one-fn (fn [row]
                      {:results    (results-as-bytes row)
                       :updated-at (:updated_at row)})
                    [:model/QueryCache :results :updated_at]
                    {:where [:and
                             [:= :query_hash query-hash]
                             [:= :has_results true]
                             (when min-updated-at
                               [:>= :updated_at min-updated-at])]}))

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
  "Atomically claim, across processes, the right to compute the query with `query-hash`, via a conditional
  UPDATE on `refresh_started_at`. Returns true iff this process won the lease (and so should recompute); false means
  another process is already computing it. A lease older than `lease-ms` is considered abandoned (e.g. the claimer
  crashed) and can be taken over.

  When no row exists at all (a cold miss), the claim is an INSERT of a lease-only row -- `has_results` false, with the
  lease held -- so concurrent cold-miss callers across processes can coordinate too; of two processes racing the
  INSERT, the loser hits the primary-key constraint and returns false. Every read filters lease-only rows out on
  `has_results`, and the first successful [[save-results!]] turns one into a real entry. Their `results` is a
  zero-length blob only because the column is NOT NULL; nothing reads it.

  Updates the raw table, not the `:model/QueryCache` model: the model's `:hook/updated-at-timestamped?` before-update
  hook makes toucan2 run a non-atomic SELECT-then-UPDATE-by-PK, which would move the conditional lease check into the
  SELECT and let two processes both win. The raw table keeps this a single atomic conditional UPDATE, which also means
  the hook does not run -- so `updated_at` is left alone. That is intentional: `updated_at` means \"when the results
  blob was last written\", read that way by [[cache-fresh?]], [[purge-old-cache-entries!]], and the EE refresh
  scheduler; bumping it here would let a crashed refresh silently extend the row's freshness (#76856)."
  [query-hash lease-ms]
  (or (pos? (t2/update! (t2/table-name :model/QueryCache)
                        {:query_hash                                         query-hash
                         [:coalesce :refresh_started_at lease-free-sentinel] [:< (ms-ago lease-ms)]}
                        {:refresh_started_at (t/offset-date-time)}))
      (and (not (t2/exists? (t2/table-name :model/QueryCache) :query_hash query-hash))
           (try
             (t2/insert! (t2/table-name :model/QueryCache)
                         {:query_hash         query-hash
                          :results            (byte-array 0)
                          :has_results        false
                          :updated_at         (t/offset-date-time)
                          :refresh_started_at (t/offset-date-time)})
             true
             ;; any insert failure means we didn't win the claim -- most likely another process won the INSERT race
             ;; and we hit the primary-key constraint
             (catch Throwable _
               false)))))

(defn release-refresh-lease!
  "Release the refresh lease on `query-hash`, if held, without touching the stored results (raw table for the same
  reason as [[try-acquire-refresh-lease!]]). Never throws: this runs when a compute has already failed, and a failed
  lease cleanup shouldn't mask that error -- the lease still expires on its own."
  [query-hash]
  (try
    (t2/update! (t2/table-name :model/QueryCache)
                {:query_hash query-hash}
                {:refresh_started_at nil})
    (catch Throwable e
      (log/error e "Error releasing cache refresh lease")))
  nil)

(defn delete-entry!
  "Delete the cache entry for `query-hash`, if one exists. Deleting the row also releases any held refresh lease, so
  after a refresh fails to save new results the outdated blob is neither served stale to lease losers nor treated as
  fresh for the rest of its window. Never throws: this runs during query result reduction, and a failed cleanup
  shouldn't fail a query that already ran successfully."
  [^bytes query-hash]
  (try
    (t2/delete! (t2/table-name :model/QueryCache) :query_hash query-hash)
    (catch Throwable e
      (log/error e "Error deleting outdated cache entry")))
  nil)

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
  "Save the `results` of query with `query-hash`, updating an existing QueryCache entry (including a cold-miss
  lease-only row) if one already exists, otherwise creating a new entry. Also releases any held refresh lease.

  Writes the raw table, not the `:model/QueryCache` model: the model's `:hook/updated-at-timestamped?` hook can
  override `updated_at` with the database's `now()`, but `updated_at` must come from the JVM clock -- freshness
  decisions compare it against boundaries computed from that clock."
  [^bytes query-hash ^bytes results]
  (log/debugf "Caching results for query with hash %s." (pr-str (i/short-hex-hash query-hash)))
  (let [row {:updated_at         (t/offset-date-time)
             :results            (encryption/maybe-encrypt-for-stream results)
             :has_results        true
             :refresh_started_at nil}]
    (try
      (when (zero? (t2/update! (t2/table-name :model/QueryCache) {:query_hash query-hash} row))
        (try
          (t2/insert! (t2/table-name :model/QueryCache) (assoc row :query_hash query-hash))
          ;; lost an insert race -- the row exists now, so update it
          (catch Throwable _
            (t2/update! (t2/table-name :model/QueryCache) {:query_hash query-hash} row))))
      (catch Throwable e
        (log/error e "Error saving query results to cache.")))
    nil))

(defmethod i/cache-backend :db
  [_]
  (reify i/CacheBackend
    (cached-results-since [_ query-hash min-updated-at respond]
      (if-let [{:keys [^bytes results updated-at]} (select-cache-entry-since query-hash min-updated-at)]
        (with-open [is (encryption/maybe-decrypt-stream (ByteArrayInputStream. results))]
          (respond is updated-at))
        (respond nil nil)))

    (save-results! [_ query-hash is]
      (save-results! query-hash is)
      nil)

    (purge-old-entries! [_ max-age-seconds]
      (purge-old-cache-entries! max-age-seconds))

    (delete-entry! [_ query-hash]
      (delete-entry! query-hash))

    (try-acquire-refresh-lease! [_ query-hash lease-ms]
      (try-acquire-refresh-lease! query-hash lease-ms))

    (release-refresh-lease! [_ query-hash]
      (release-refresh-lease! query-hash))))
