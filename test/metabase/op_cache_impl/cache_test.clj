(ns metabase.op-cache-impl.cache-test
  "Tests for the storage-backed op cache. Timing is puppeteered: the clock is mocked, and concurrent interleavings are
  forced with latches, so every scenario is deterministic."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.op-cache-impl.cache :as impl.cache]
   [metabase.op-cache-impl.storage :as storage]
   [metabase.op-cache-impl.test-util :as impl.tu]
   [metabase.op-cache.core :as op-cache]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private t0 (t/instant "2026-01-01T00:00:00Z"))

(defn- make-cache [storage & {:as opts}]
  (impl.cache/cache storage (merge {:poll-interval-ms 5} opts)))

(defn- counting-op [counter value]
  (fn []
    (swap! counter inc)
    value))

(defn- ttl-invalidated-at
  "Freshness boundary for a TTL of `ttl-ms`: values written more than `ttl-ms` before now are stale."
  [ttl-ms]
  (t/minus (t/instant) (t/millis ttl-ms)))

(defn- wait-until-done
  "Give future `fut` up to ~1 second to complete on its own. Returns immediately once it does."
  [fut]
  (loop [attempts-remaining 100]
    (when (and (pos? attempts-remaining)
               (not (future-done? fut)))
      (Thread/sleep 10)
      (recur (dec attempts-remaining)))))

;;; -------------------------------------------------- Basic behavior ------------------------------------------------

(deftest ^:parallel cold-miss-then-fresh-hit-test
  (t/with-clock (t/mock-clock t0)
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage)
          calls   (atom 0)]
      (testing "a cold miss computes and stores"
        (is (= {:value 42, :source :computed, :stored true}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls 42)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (= 1 @calls)))
      (testing "a subsequent call is served the fresh stored value without running the op"
        (is (= {:value 42, :source :cached-fresh, :written-at t0}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :should-not-run)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (= 1 @calls))))))

(deftest ^:parallel stale-value-recomputed-test
  (let [storage (impl.tu/in-memory-storage)
        cache   (make-cache storage)
        calls   (atom 0)]
    (t/with-clock (t/mock-clock t0)
      (op-cache/fetch-or-compute! cache "k" (counting-op calls :v1) {:invalidated-at (ttl-invalidated-at 60000)}))
    (testing "with no refresh in flight, a stale value is recomputed, not served"
      (t/with-clock (t/mock-clock (t/plus t0 (t/seconds 61)))
        (is (= {:value :v2, :source :computed, :stored true}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :v2)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (= 2 @calls))))))

(deftest ^:parallel nil-invalidated-at-never-serves-test
  (testing "nil :invalidated-at means freshness is unknowable, so the stored value is never served"
    (t/with-clock (t/mock-clock t0)
      (let [storage (impl.tu/in-memory-storage)
            cache   (make-cache storage)
            calls   (atom 0)]
        (op-cache/fetch-or-compute! cache "k" (counting-op calls :v1) {:invalidated-at nil})
        (is (= {:value :v2, :source :computed, :stored true}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :v2) {:invalidated-at nil})))
        (is (= 2 @calls))))))

(deftest ^:parallel min-duration-result-not-stored-test
  (testing "the result of an op that ran faster than :min-duration-ms is returned but not stored, and any stored
            value is evicted rather than left to be served after its refresh"
    (let [storage (impl.tu/in-memory-storage)
          calls   (atom 0)]
      (t/with-clock (t/mock-clock t0)
        (op-cache/fetch-or-compute! (make-cache storage) "k" (counting-op calls :v1)
                                    {:invalidated-at (ttl-invalidated-at 60000)}))
      (t/with-clock (t/mock-clock (t/plus t0 (t/seconds 61)))
        (is (= {:value :v2, :source :computed, :stored false}
               (op-cache/fetch-or-compute! (make-cache storage :min-duration-ms 60000) "k" (counting-op calls :v2)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (nil? (storage/read-entry storage "k")))))))

(deftest ^:parallel max-size-result-not-stored-test
  (testing "a value larger than :max-size (as measured by :size-fn) is returned but not stored"
    (t/with-clock (t/mock-clock t0)
      (let [storage (impl.tu/in-memory-storage)
            cache   (make-cache storage :max-size 3)
            calls   (atom 0)]
        (is (= {:value [1 2 3 4], :source :computed, :stored false}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls [1 2 3 4])
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (nil? (storage/read-entry storage "k")))
        (testing "a value within :max-size is stored"
          (is (= {:value [1 2 3], :source :computed, :stored true}
                 (op-cache/fetch-or-compute! cache "k" (counting-op calls [1 2 3])
                                             {:invalidated-at (ttl-invalidated-at 60000)}))))))))

(deftest ^:parallel keys-written-since-test
  (let [storage (impl.tu/in-memory-storage)
        cache   (make-cache storage)]
    (t/with-clock (t/mock-clock t0)
      (op-cache/fetch-or-compute! cache "old" (fn [] :v) {:invalidated-at nil}))
    (t/with-clock (t/mock-clock (t/plus t0 (t/seconds 120)))
      (op-cache/fetch-or-compute! cache "new" (fn [] :v) {:invalidated-at nil})
      (testing "only keys written at or after the threshold are returned"
        (is (= ["new"]
               (into [] (op-cache/keys-written-since cache (t/minus (t/instant) (t/seconds 60)))))))
      (testing "an early enough threshold returns every key"
        (is (= #{"old" "new"}
               (into #{} (op-cache/keys-written-since cache (t/minus (t/instant) (t/seconds 300))))))))))

(deftest ^:parallel nil-size-not-stored-test
  (testing "a value whose size can't be determined (:size-fn returns nil) is never stored when :max-size is set"
    (t/with-clock (t/mock-clock t0)
      (let [storage (impl.tu/in-memory-storage)
            cache   (make-cache storage :max-size 100 :size-fn (constantly nil))
            calls   (atom 0)]
        (is (= {:value :v1, :source :computed, :stored false}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :v1)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (nil? (storage/read-entry storage "k")))))))

(deftest ^:parallel evict-test
  (t/with-clock (t/mock-clock t0)
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage)
          calls   (atom 0)]
      (op-cache/fetch-or-compute! cache "k" (counting-op calls :v1) {:invalidated-at (ttl-invalidated-at 60000)})
      (op-cache/evict! cache "k")
      (testing "after evict! the next call recomputes"
        (is (= {:value :v2, :source :computed, :stored true}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :v2)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))))))

;;; --------------------------------------------- Concurrent interleavings -------------------------------------------

(deftest ^:parallel cold-miss-coalesces-concurrent-callers-test
  (testing "concurrent callers on a cold miss run the op exactly once; the loser is served the winner's result"
    (t/with-clock (t/mock-clock t0)
      (let [storage    (impl.tu/in-memory-storage)
            cache      (make-cache storage)
            op-entered (promise)
            release    (promise)
            calls      (atom 0)
            winner-op  (fn []
                         (swap! calls inc)
                         (deliver op-entered true)
                         (u/deref-with-timeout release 10000)
                         :fresh-value)
            caller-1   (future (op-cache/fetch-or-compute! cache "k" winner-op
                                                           {:invalidated-at (ttl-invalidated-at 60000)}))]
        ;; caller-1 is now provably holding the claim, blocked inside the op
        (u/deref-with-timeout op-entered 10000)
        (let [caller-2 (future (op-cache/fetch-or-compute! cache "k" (counting-op calls :should-not-run)
                                                           {:invalidated-at (ttl-invalidated-at 60000)}))]
          (deliver release true)
          (is (= {:value :fresh-value, :source :computed, :stored true}
                 (u/deref-with-timeout caller-1 10000)))
          (is (= {:value :fresh-value, :source :cached-fresh, :written-at t0}
                 (u/deref-with-timeout caller-2 10000)))
          (is (= 1 @calls)
              "the op must have run exactly once"))))))

(deftest ^:parallel slightly-stale-value-served-during-refresh-test
  (testing "while a refresh is in flight, a value only slightly past its freshness boundary is served stale
            immediately -- concurrent requests don't stampede the underlying resource"
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage)]
      (t/with-clock (t/mock-clock t0)
        (storage/write-entry! storage "k" :old-value))
      ;; 61s later the value is 1s past a 60s TTL -- comfortably within the 5-minute grace window
      (t/with-clock (t/mock-clock (t/plus t0 (t/seconds 61)))
        (let [op-entered (promise)
              release    (promise)
              refresher  (future (op-cache/fetch-or-compute! cache "k"
                                                             (fn []
                                                               (deliver op-entered true)
                                                               (u/deref-with-timeout release 10000)
                                                               :new-value)
                                                             {:invalidated-at (ttl-invalidated-at 60000)}))
              calls      (atom 0)]
          (u/deref-with-timeout op-entered 10000)
          (testing "a caller during the refresh is served the stale value without waiting"
            ;; deref *before* releasing the refresher: this can only succeed if the caller was served stale
            (is (= {:value :old-value, :source :cached-stale, :written-at t0}
                   (u/deref-with-timeout
                    (future (op-cache/fetch-or-compute! cache "k" (counting-op calls :should-not-run)
                                                        {:invalidated-at (ttl-invalidated-at 60000)}))
                    10000)))
            (is (zero? @calls)))
          (deliver release true)
          (is (= {:value :new-value, :source :computed, :stored true}
                 (u/deref-with-timeout refresher 10000))))))))

(deftest ^:parallel staleness-is-bounded-test
  (testing "a value stale beyond the grace window is never served; callers wait for the in-flight refresh instead
            (the generic form of #78339)"
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage)]
      (t/with-clock (t/mock-clock t0)
        (storage/write-entry! storage "k" :ancient-value))
      ;; 30 days later the value is stale by ~30 days -- far beyond the 5-minute grace window
      (t/with-clock (t/mock-clock (t/plus t0 (t/days 30)))
        (let [op-entered (promise)
              release    (promise)
              refresher  (future (op-cache/fetch-or-compute! cache "k"
                                                             (fn []
                                                               (deliver op-entered true)
                                                               (u/deref-with-timeout release 10000)
                                                               :new-value)
                                                             {:invalidated-at (ttl-invalidated-at 60000)}))]
          (u/deref-with-timeout op-entered 10000)
          (let [caller-2 (future (op-cache/fetch-or-compute! cache "k" (fn [] :should-not-run)
                                                             {:invalidated-at (ttl-invalidated-at 60000)}))]
            ;; give caller-2 ample time to (wrongly) serve the ancient value; it must instead still be waiting
            (wait-until-done caller-2)
            (is (not (future-done? caller-2))
                "the caller must wait for the refresh, not be served the ancient value")
            (deliver release true)
            (is (= {:value :new-value, :source :computed, :stored true}
                   (u/deref-with-timeout refresher 10000)))
            (testing "the waiting caller is served the refreshed value"
              (is (= :new-value
                     (:value (u/deref-with-timeout caller-2 10000)))))))))))

(deftest ^:parallel abandoned-claim-taken-over-test
  (testing "a claim left behind by a crashed process expires after :claim-ttl-ms and is taken over"
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage :claim-ttl-ms 1000)
          calls   (atom 0)]
      (t/with-clock (t/mock-clock t0)
        ;; simulate another process claiming the key and then crashing
        (is (true? (storage/try-claim! storage "k" 1000))))
      (t/with-clock (t/mock-clock (t/plus t0 (t/millis 1001)))
        (is (= {:value :recovered, :source :computed, :stored true}
               (op-cache/fetch-or-compute! cache "k" (counting-op calls :recovered)
                                           {:invalidated-at (ttl-invalidated-at 60000)})))
        (is (= 1 @calls))))))

(deftest ^:parallel op-exception-releases-claim-test
  (testing "an op that throws releases the claim (so the key isn't blocked until claim expiry) and leaves any stored
            value in place"
    (let [storage (impl.tu/in-memory-storage)
          cache   (make-cache storage)]
      (t/with-clock (t/mock-clock t0)
        (storage/write-entry! storage "k" :old-value))
      (t/with-clock (t/mock-clock (t/plus t0 (t/seconds 61)))
        (is (re-find
             #"op exploded"
             (try (op-cache/fetch-or-compute! cache "k" (fn [] (throw (Exception. "op exploded")))
                                              {:invalidated-at (ttl-invalidated-at 60000)})
                  (catch Exception e (ex-message e)))))
        (testing "the stored value survived the failed refresh"
          (is (= :old-value
                 (:value (storage/read-entry storage "k")))))
        (testing "the claim was released: a subsequent caller computes immediately instead of waiting for expiry"
          (is (= {:value :new-value, :source :computed, :stored true}
                 (u/deref-with-timeout
                  (future (op-cache/fetch-or-compute! cache "k" (fn [] :new-value)
                                                      {:invalidated-at (ttl-invalidated-at 60000)}))
                  10000))))))))

(deftest ^:parallel waiter-takes-over-after-claimer-fails-test
  (testing "when the claim holder's op throws, a waiting caller takes over the claim and computes its own result"
    (t/with-clock (t/mock-clock t0)
      (let [storage    (impl.tu/in-memory-storage)
            cache      (make-cache storage)
            op-entered (promise)
            release    (promise)
            caller-1   (future (op-cache/fetch-or-compute! cache "k"
                                                           (fn []
                                                             (deliver op-entered true)
                                                             (u/deref-with-timeout release 10000)
                                                             (throw (Exception. "op exploded")))
                                                           {:invalidated-at (ttl-invalidated-at 60000)}))]
        (u/deref-with-timeout op-entered 10000)
        (let [caller-2 (future (op-cache/fetch-or-compute! cache "k" (fn [] :recovered)
                                                           {:invalidated-at (ttl-invalidated-at 60000)}))]
          (deliver release true)
          (is (re-find #"op exploded"
                       (try (deref caller-1)
                            (catch Exception e (ex-message e)))))
          (is (= {:value :recovered, :source :computed, :stored true}
                 (u/deref-with-timeout caller-2 10000))))))))
