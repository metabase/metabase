(ns metabase.cache.op-cache-storage
  "An op-cache [[metabase.op-cache-impl.storage/Storage]] backed by the application database's `op_cache` table
  (see [[metabase.cache.models.op-cache-entry]]).

  Keys are byte arrays, stored hex-encoded; values are byte arrays, encrypted at rest when a site encryption key is
  configured. A row with a NULL `value` is a claim-only row -- a cold-miss claim with no result stored yet -- and is
  reported as no-entry by `read-entry`. Storing a nil value is not supported.

  Failures of the application database degrade rather than propagate: a failed read counts as no entry and a failed
  claim counts as won (every caller computes), so cache trouble never fails the operation itself."
  (:require
   [buddy.core.codecs :as codecs]
   [java-time.api :as t]
   [metabase.op-cache-impl.storage :as op-cache.storage]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream InputStream)
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(defn- blob->bytes
  "The raw bytes of a `value` column read. An H2 `JdbcBlob` is only valid while its result set is open, so this must
  run inside the row-reading fn of a select."
  ^bytes [v]
  (if (instance? Blob v)
    (.getBytes ^Blob v 1 (int (.length ^Blob v)))
    v))

(defn- decrypt-value ^bytes [^bytes v]
  (with-open [is ^InputStream (encryption/maybe-decrypt-stream (ByteArrayInputStream. v))]
    (.readAllBytes is)))

(def ^:private claim-free-sentinel
  "Substituted (via COALESCE) for a NULL `claim_started_at` so that 'no claim held' counts as a free claim. Any
  timestamp older than every realistic claim cutoff works."
  (t/offset-date-time "1970-01-01T00:00Z"))

(defn storage
  "An op-cache Storage over the application database."
  []
  (reify op-cache.storage/Storage
    (read-entry [_ k]
      (try
        (t2/select-one-fn (fn [row]
                            ;; a NULL value is a claim-only row, not an entry
                            (when-let [value (:value row)]
                              {:value      (decrypt-value (blob->bytes value))
                               :written-at (:written_at row)}))
                          [:model/OpCacheEntry :value :written_at]
                          :cache_key (codecs/bytes->hex k))
        (catch Throwable e
          (log/errorf e "Error reading cached value: %s" (ex-message e))
          nil)))

    (write-entry! [_ k value]
      (let [cache-key (codecs/bytes->hex k)
            row       {:value            (encryption/maybe-encrypt-for-stream value)
                       :written_at       (t/offset-date-time)
                       :claim_started_at nil}]
        (try
          (when (zero? (t2/update! :model/OpCacheEntry cache-key row))
            (try
              (t2/insert! :model/OpCacheEntry (assoc row :cache_key cache-key))
              ;; lost an insert race -- the row exists now, so update it
              (catch Throwable _
                (t2/update! :model/OpCacheEntry cache-key row))))
          (catch Throwable e
            (log/errorf e "Error saving value to cache: %s" (ex-message e)))))
      nil)

    (delete-entry! [_ k]
      (try
        (t2/delete! :model/OpCacheEntry :cache_key (codecs/bytes->hex k))
        (catch Throwable e
          (log/errorf e "Error deleting cache entry: %s" (ex-message e))))
      nil)

    (try-claim! [_ k claim-ttl-ms]
      (let [cache-key (codecs/bytes->hex k)]
        (try
          (or (pos? (t2/update! :model/OpCacheEntry
                                {:cache_key cache-key
                                 [:coalesce :claim_started_at claim-free-sentinel]
                                 [:< (t/minus (t/offset-date-time) (t/millis claim-ttl-ms))]}
                                {:claim_started_at (t/offset-date-time)}))
              ;; no row at all (a cold miss): claim by inserting a claim-only row. Of two callers racing the INSERT,
              ;; the loser hits the primary-key constraint and returns false.
              (and (not (t2/exists? :model/OpCacheEntry :cache_key cache-key))
                   (try
                     (t2/insert! :model/OpCacheEntry {:cache_key        cache-key
                                                      :claim_started_at (t/offset-date-time)})
                     true
                     (catch Throwable _
                       false))))
          (catch Throwable e
            (log/errorf e "Error acquiring cache claim: %s" (ex-message e))
            true))))

    (release-claim! [_ k]
      (let [cache-key (codecs/bytes->hex k)]
        (try
          ;; a claim-only row without its claim is meaningless -- remove it entirely
          (when (zero? (t2/delete! :model/OpCacheEntry :cache_key cache-key :value nil))
            (t2/update! :model/OpCacheEntry cache-key {:claim_started_at nil}))
          (catch Throwable e
            (log/errorf e "Error releasing cache claim: %s" (ex-message e)))))
      nil)

    (purge-entries-written-before! [_ cutoff]
      (try
        (t2/delete! :model/OpCacheEntry
                    {:where [:or
                             [:<= :written_at cutoff]
                             ;; claim-only rows never age via written_at; purge abandoned ones by claim age
                             [:and [:= :value nil] [:<= :claim_started_at cutoff]]]})
        (catch Throwable e
          (log/errorf e "Error purging old cache entries: %s" (ex-message e))))
      nil)

    (keys-written-since [_ threshold]
      (eduction (map (comp codecs/hex->bytes :cache_key))
                (t2/reducible-select [:model/OpCacheEntry :cache_key]
                                     :written_at [:>= threshold])))

    (delete-all-entries! [_]
      (try
        (t2/delete! :model/OpCacheEntry)
        (catch Throwable e
          (log/errorf e "Error deleting all cache entries: %s" (ex-message e))))
      nil)

    (stats [_]
      ;; count only rows with a stored value -- a NULL value is a claim-only row, not a cache entry
      (let [{:keys [entries length]} (t2/select-one [:model/OpCacheEntry
                                                     [[:count :value] :entries]
                                                     [[:avg [:length :value]] :length]])]
        {:entries            (or entries 0)
         :average-value-size (some-> length double)}))))
