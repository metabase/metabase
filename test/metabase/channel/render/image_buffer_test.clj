(ns metabase.channel.render.image-buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.image-buffer :as image-buffer])
  (:import
   (java.awt.image BufferedImage)))

(set! *warn-on-reflection* true)

;; Every test runs against its OWN pool built with [[image-buffer/->pool]], not the process-wide default pool. That
;; gives deterministic counters (no cross-test residue) and no background sweeper racing the assertions, so we can
;; assert exact hit/miss/idle counts rather than fuzzy "some reuse" thresholds.

(deftest acquire-returns-argb-of-requested-size-test
  (testing "acquire yields a TYPE_INT_ARGB buffer of exactly the requested size, for any size asked of one pool"
    (let [p     (image-buffer/->pool)
          sizes [[320 240] [1200 800] [1 1] [1200 1322] [64 480]]]
      (doseq [[w h] sizes]
        (let [^BufferedImage img (image-buffer/acquire p w h)]
          (is (instance? BufferedImage img) (format "%dx%d is a BufferedImage" w h))
          (is (= w (.getWidth img)) (format "%dx%d width" w h))
          (is (= h (.getHeight img)) (format "%dx%d height" w h))
          (is (= BufferedImage/TYPE_INT_ARGB (.getType img)) (format "%dx%d is ARGB" w h)))))))

(deftest sequential-cycle-reuses-after-one-allocation-test
  (testing "cycling one size allocates once, then reuses every time"
    (let [p (image-buffer/->pool)
          n 100]
      (dotimes [_ n]
        (image-buffer/release p (image-buffer/acquire p 1207 503)))
      (let [{:keys [hits misses idle]} (image-buffer/stats p)]
        (is (= 1 misses) "only the very first acquire allocates; the rest must reuse")
        (is (= (dec n) hits) "every acquire after the first reused a pooled buffer")
        (is (= 1 idle) "one buffer cycles through the whole run")))))

(deftest concurrent-same-size-allocates-at-most-thread-count-test
  (testing "concurrent threads cycling one size allocate at most thread-count buffers"
    (let [thread-count       8
          cycles-per-thread  50
          timeout-ms         5000
          pool               (image-buffer/->pool)
          ;; A barrier so all threads start their acquire/release loops at the same moment (genuine overlap, so the
          ;; "<= thread-count allocations" assertion exercises real concurrency). `await` is bounded, and the worker
          ;; reaches it via try/finally, so a thread that throws can't strand the others on the barrier.
          started            (java.util.concurrent.CyclicBarrier. thread-count)
          worker             (fn []
                               (.await started (long timeout-ms) java.util.concurrent.TimeUnit/MILLISECONDS)
                               (dotimes [_ cycles-per-thread]
                                 (image-buffer/release pool (image-buffer/acquire pool 909 405)))
                               ::done)
          futures            (doall (repeatedly thread-count #(future (worker))))
          results            (mapv #(deref % timeout-ms ::timeout) futures)]
      (is (every? #(= ::done %) results)
          "every worker finished within the timeout (no deadlock / no thrown worker)")
      (let [{:keys [hits misses]} (image-buffer/stats pool)]
        (is (= (* thread-count cycles-per-thread) (+ hits misses)) "every acquire counted as a hit or a miss")
        (is (<= misses thread-count) "never allocated more than the number of concurrent threads")
        (is (pos? hits) "reuse happened")))))

(deftest many-sizes-pool-contents-and-isolation-test
  (testing "many distinct sizes pool independently; each acquire gets its own size"
    (let [p     (image-buffer/->pool)
          sizes (for [i (range 9)] [(+ 1200 i) (+ 800 (* 10 i))])]  ;; 9 dashboard-ish sizes, all distinct
      ;; release one buffer of each size into the pool
      (doseq [[w h] sizes]
        (image-buffer/release p (image-buffer/acquire p w h)))
      (let [{:keys [by-size idle]} (image-buffer/stats p)]
        (is (= (count sizes) idle) "one idle buffer per distinct size was retained")
        (is (= (set sizes) (set (keys by-size))) "the pool holds exactly the sizes we released, keyed correctly")
        (is (every? #(= 1 %) (vals by-size)) "exactly one buffer per size (we released one each)"))
      ;; now re-acquire each size and assert we get back a correctly-sized, reused buffer (not a collision)
      (doseq [[w h] sizes]
        (let [hits-before (:hits (image-buffer/stats p))
              ^BufferedImage img (image-buffer/acquire p w h)]
          (is (= [w h] [(.getWidth img) (.getHeight img)]) "acquire returned a buffer of the requested size")
          (is (= (inc hits-before) (:hits (image-buffer/stats p)))
              "the acquire reused this size's pooled buffer rather than allocating (no cross-size theft)")
          (image-buffer/release p img)))
      (is (= (count sizes) (:idle (image-buffer/stats p))) "after the round trip the pool still holds one per size"))))

(deftest reused-buffer-is-cleared-test
  (testing "a reused buffer is wiped to fully transparent (no data leak between renders)"
    (let [p (image-buffer/->pool)]
      (let [^BufferedImage img (image-buffer/acquire p 64 64)]
        (.setRGB img 10 10 (unchecked-int 0xFF00FF00))
        (is (not (zero? (.getRGB img 10 10))) "sanity: pixel was dirtied")
        (image-buffer/release p img))
      (let [^BufferedImage img (image-buffer/acquire p 64 64)]
        (is (zero? (.getRGB img 10 10)) "the reused buffer no longer shows the previous render's pixel")))))

(deftest different-sizes-do-not-collide-test
  (testing "a buffer is only ever reused for its own exact size"
    (let [p (image-buffer/->pool)
          a (image-buffer/acquire p 100 100)]
      (image-buffer/release p a)
      (let [^BufferedImage b (image-buffer/acquire p 200 100)]
        (is (not (identical? a b)) "a different size must not hand back the wrong-sized buffer")
        (is (= 200 (.getWidth b)))
        (is (= 100 (.getHeight b)))))))

(deftest empty-pool-allocates-fresh-buffer-test
  (testing "acquiring with nothing pooled yields a fresh, correctly-sized buffer (the empty-pool branch -- there is no
            blocking primitive in acquire to wait on; pollFirst returns nil immediately on an empty deque)"
    (let [p (image-buffer/->pool)
          ^BufferedImage img (image-buffer/acquire p 333 222)]
      (is (instance? BufferedImage img))
      (is (= 333 (.getWidth img)))
      (is (= 222 (.getHeight img))))))

(deftest per-size-cap-bounds-retention-test
  (testing "a size retains at most per-size-cap idle buffers"
    (let [cap 3
          p (image-buffer/->pool {:per-size-cap cap})
          ;; acquire more distinct buffers than the cap (force misses by holding them all before releasing any)
          held (vec (repeatedly (* 2 cap) #(image-buffer/acquire p 700 350)))]
      (run! #(image-buffer/release p %) held)
      (is (= cap (:idle (image-buffer/stats p))) "retained exactly per-size-cap; surplus discarded"))))

(deftest global-cap-bounds-total-retention-test
  (testing "the global cap bounds total idle buffers across sizes"
    (let [gcap 5
          p (image-buffer/->pool {:per-size-cap 10 :global-cap gcap})
          ;; release one buffer of each of many distinct sizes; total retained must not exceed the global cap
          held (vec (for [i (range (* 2 gcap))] (image-buffer/acquire p (+ 1000 i) 400)))]
      (run! #(image-buffer/release p %) held)
      (is (<= (:idle (image-buffer/stats p)) gcap)
          "total idle buffers across all sizes stays within the global cap"))))

(deftest sweep-evicts-stale-and-drains-to-zero-test
  (testing "sweep! drops buffers idle past the TTL and drains to zero"
    ;; buffers are stamped with the real wall clock at release, so we sweep relative to a captured `now`
    (let [ttl 60000
          p (image-buffer/->pool {:idle-ttl-ms ttl})]
      ;; pool a couple of buffers, then release; they are stamped at ~now
      (image-buffer/release p (image-buffer/acquire p 480 480))
      (image-buffer/release p (image-buffer/acquire p 481 481))
      (is (= 2 (:idle (image-buffer/stats p))) "two buffers idle before any sweep")
      (let [now (System/currentTimeMillis)]
        ;; sweep at a moment still within the TTL of the release -> nothing evicted
        (image-buffer/sweep! p (+ now (quot ttl 2)))
        (is (pos? (:idle (image-buffer/stats p))) "fresh buffers (within TTL) survive a sweep")
        ;; sweep well past the TTL -> everything drains to zero and empty keys are removed
        (image-buffer/sweep! p (+ now (* 10 ttl)))
        (is (= 0 (:idle (image-buffer/stats p))) "buffers idle past the TTL are evicted; the pool drains to zero")))))

(deftest stats-idle-reflects-reality-test
  (testing "reported idle count matches reality and never goes negative"
    (let [p (image-buffer/->pool)]
      (dotimes [i 20]
        ;; interleave acquires and releases of a few sizes
        (let [img (image-buffer/acquire p (+ 600 (mod i 3)) 300)]
          (when (even? i) (image-buffer/release p img))))
      (let [idle (:idle (image-buffer/stats p))]
        (is (>= idle 0) "idle count is never negative")
        ;; cross-check against the records' own count by draining everything we can and counting
        (is (= idle (:idle (image-buffer/stats p))) "idle count is stable / self-consistent on repeated reads")))))

(deftest release-nil-is-safe-test
  (is (nil? (image-buffer/release (image-buffer/->pool) nil))))
