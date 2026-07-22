(ns metabase.op-cache-impl.cache
  "A storage-backed [[metabase.op-cache.core/OpCache]] with cross-process request coalescing and bounded
  stale-while-revalidate semantics.

  The cache coordinates concurrent callers of the same operation (identified by a caller-supplied key) so that at any
  moment at most one of them is actually running it:

    * A caller that finds a fresh stored value is served it directly.
    * On a miss (or a stale value), one caller atomically claims the key and computes; when it finishes it stores the
      value and releases the claim.
    * While a claim is held, a caller that finds a *slightly* stale value -- one that went stale no more than
      `:stale-grace-ms` ago -- is served it as-is rather than waiting for the refresh. Without this grace window,
      every expiry would make every concurrent caller block for the full duration of the recompute -- a latency
      cliff at each freshness boundary. The grace window trades boundedly-stale data for flat serve latency while a
      refresh is in flight; callers that want strict waiting instead can set `:stale-grace-ms` to 0.
    * Every other concurrent caller (a cold miss, or a value stale beyond the grace window) waits for the claim
      holder's result instead of computing its own.

  All staleness and refresh handling is driven by caller activity against the storage; there is no background process.
  A claim abandoned by a crashed process expires after `:claim-ttl-ms` and is taken over by a waiting caller.

  Freshness is decided by the caller per call via `:invalidated-at`: stored values written before that instant are
  stale. A nil `:invalidated-at` means freshness cannot be determined, so a stored value is never served (but claim
  coordination still applies)."
  (:require
   [java-time.api :as t]
   [metabase.op-cache-impl.storage :as storage]
   [metabase.op-cache.core :as op-cache]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def default-options
  "Defaults for [[cache]] options."
  {:min-duration-ms  0
   :max-size         nil
   :size-fn          count
   :stale-grace-ms   (u/minutes->ms 5)
   :claim-ttl-ms     (u/minutes->ms 5)
   :poll-interval-ms 100})

(defn- fresh?
  "Whether a value written at `written-at` is fresh relative to the caller's `invalidated-at` boundary."
  [written-at invalidated-at]
  (boolean (and written-at
                invalidated-at
                (not (t/before? (t/instant written-at) (t/instant invalidated-at))))))

(defn- within-grace?
  "Whether a stale value went stale recently enough (within `grace-ms` of `invalidated-at`) to be served while a
  refresh is in flight."
  [written-at invalidated-at grace-ms]
  (boolean (and written-at
                invalidated-at
                (not (t/before? (t/instant written-at)
                                (t/minus (t/instant invalidated-at) (t/millis grace-ms)))))))

(defn- compute-and-store!
  "Run `op` while holding the claim on `k`, store the value if it qualifies, and release the claim (storing and
  deleting both release it)."
  [storage k op {:keys [min-duration-ms max-size size-fn]}]
  (let [start-ns (System/nanoTime)
        value    (try
                   (op)
                   (catch Throwable e
                     ;; release so a waiting caller can take over; leave any stored value in place -- it can still be
                     ;; served within the grace window
                     (storage/release-claim! storage k)
                     (throw e)))
        duration-ms (/ (- (System/nanoTime) start-ns) 1e6)
        size        (when max-size (size-fn value))
        storable?   (and (> duration-ms min-duration-ms)
                         (or (nil? max-size)
                             ;; a nil size means the value's size can't be determined, so it can't be shown to fit
                             ;; within the bound -- don't store it
                             (and (some? size) (<= size max-size))))]
    (if storable?
      (storage/write-entry! storage k value)
      ;; a value we won't store makes any stored value outdated; delete it (also releasing the claim) so it is
      ;; neither served stale nor treated as fresh for the rest of its window
      (storage/delete-entry! storage k))
    {:value value, :source :computed, :stored storable?}))

(defn cache
  "An [[op-cache/OpCache]] over a [[storage/Storage]]. `opts` (see [[default-options]]):

    * `:min-duration-ms`  -- only store results of ops that took longer than this to run.
    * `:max-size`         -- only store values of size at most this, as measured by `:size-fn`; nil = no limit.
    * `:size-fn`          -- measures a value for the `:max-size` check. May return nil when the value's size can't
                             be determined; such a value is never stored when a `:max-size` bound is configured.
    * `:stale-grace-ms`   -- how long past `:invalidated-at` a stale value may still be served while another caller
                             holds the claim. Beyond this, callers wait for the claim holder's result instead.
    * `:claim-ttl-ms`     -- age at which a claim counts as abandoned and may be taken over. Should comfortably
                             exceed a normal op's run time.
    * `:poll-interval-ms` -- how often a waiting caller re-checks storage."
  [storage opts]
  (let [{:keys [stale-grace-ms claim-ttl-ms poll-interval-ms], :as opts} (merge default-options opts)]
    (reify op-cache/OpCache
      (fetch-or-compute! [_ k op call-opts]
        (let [{:keys [invalidated-at]} call-opts]
          (loop []
            (let [{:keys [value written-at], :as entry} (storage/read-entry storage k)]
              (cond
                (and entry (fresh? written-at invalidated-at))
                {:value value, :source :cached-fresh, :written-at written-at}

                (storage/try-claim! storage k claim-ttl-ms)
                (compute-and-store! storage k op opts)

                (and entry (within-grace? written-at invalidated-at stale-grace-ms))
                {:value value, :source :cached-stale, :written-at written-at}

                :else
                (do
                  (Thread/sleep (long poll-interval-ms))
                  (recur)))))))
      (evict! [_ k]
        (storage/delete-entry! storage k)))))
