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
  (testing "acquire yields an ARGB BufferedImage of exactly the requested size, for any size that fits the pool"
    (let [p     (image-buffer/->pool)
          sizes [[320 240] [1200 800] [1 1] [1200 1322] [64 480]]]
      (doseq [[w h] sizes]
        (let [^BufferedImage img (image-buffer/acquire p w h)]
          (is (instance? BufferedImage img) (format "%dx%d is a BufferedImage" w h))
          (is (= w (.getWidth img)) (format "%dx%d width" w h))
          (is (= h (.getHeight img)) (format "%dx%d height" w h)))))))

(deftest sequential-cycle-reuses-after-one-allocation-test
  (testing "cycling one size allocates once, then reuses every time"
    (let [p (image-buffer/->pool)
          n 100]
      (dotimes [_ n]
        (image-buffer/release p (image-buffer/acquire p 1207 503)))
      (let [{:keys [hits misses idle]} (image-buffer/stats p)]
        (is (= 1 misses) "only the very first acquire allocates; the rest must reuse")
        (is (= (dec n) hits) "every acquire after the first reused a pooled array")
        (is (= 1 idle) "one array cycles through the whole run")))))

(deftest different-sizes-reuse-the-same-array-test
  (testing "the headline property: one fixed-size array backs ANY size that fits, so different sizes reuse it (NOT a
            per-size cache). After the first allocation every differently-sized acquire is a hit."
    (let [p (image-buffer/->pool)]
      (image-buffer/release p (image-buffer/acquire p 1200 800))   ;; allocate once
      (doseq [[w h] [[1000 600] [200 100] [1199 1000] [50 50]]]    ;; all different sizes, all fit
        (image-buffer/release p (image-buffer/acquire p w h)))
      (let [{:keys [hits misses idle]} (image-buffer/stats p)]
        (is (= 1 misses) "only the first acquire allocated; differently-sized acquires reused the same array")
        (is (= 4 hits) "every differently-sized acquire after the first was a reuse")
        (is (= 1 idle) "still just one array")))))

(deftest reused-array-is-cleared-test
  (testing "a reused array is wiped in the region the next render uses (no data leak between renders)"
    (let [p (image-buffer/->pool)]
      (let [^BufferedImage img (image-buffer/acquire p 64 64)]
        (.setRGB img 10 10 (unchecked-int 0xFF00FF00))
        (is (not (zero? (.getRGB img 10 10))) "sanity: pixel was dirtied")
        (image-buffer/release p img))
      (let [^BufferedImage img (image-buffer/acquire p 64 64)]
        (is (zero? (.getRGB img 10 10)) "the reused array no longer shows the previous render's pixel")))))

(deftest oversized-request-is-a-one-off-test
  (testing "a request larger than the fixed array size falls back to a fresh standard image and is NOT pooled"
    (let [p (image-buffer/->pool {:array-pixels (* 100 100)})         ;; tiny fixed size
          ^BufferedImage big (image-buffer/acquire p 500 500)]         ;; 250k px > 10k cap
      (is (= 500 (.getWidth big)))
      (is (= 500 (.getHeight big)))
      (is (= BufferedImage/TYPE_INT_ARGB (.getType big)) "one-off uses a standard TYPE_INT_ARGB image")
      (image-buffer/release p big)
      (let [{:keys [one-offs idle]} (image-buffer/stats p)]
        (is (= 1 one-offs) "counted as a one-off")
        (is (= 0 idle) "the oversized array was not pooled on release")))))

(deftest oversized-and-normal-coexist-test
  (testing "one-offs don't pollute the pool: a normal-size array still pools while oversized requests pass through"
    (let [p (image-buffer/->pool {:array-pixels (* 100 100)})]
      (image-buffer/release p (image-buffer/acquire p 80 80))     ;; fits -> pooled
      (image-buffer/release p (image-buffer/acquire p 500 500))   ;; oversized -> one-off, dropped
      (let [{:keys [idle one-offs misses]} (image-buffer/stats p)]
        (is (= 1 idle) "only the fitting array is pooled")
        (is (= 1 one-offs))
        (is (= 1 misses) "the fitting acquire allocated once; the one-off is counted separately")))))

(deftest max-arrays-bounds-retention-test
  (testing "the pool retains at most :max-arrays idle arrays; surplus releases are dropped"
    (let [cap 3
          p (image-buffer/->pool {:max-arrays cap})
          ;; acquire more arrays than the cap (force misses by holding them all before releasing any)
          held (vec (repeatedly (* 2 cap) #(image-buffer/acquire p 700 350)))]
      (run! #(image-buffer/release p %) held)
      (is (= cap (:idle (image-buffer/stats p))) "retained exactly :max-arrays; surplus discarded"))))

(deftest concurrent-allocates-at-most-thread-count-test
  (testing "concurrent threads cycling renders allocate at most thread-count arrays"
    (let [thread-count       8
          cycles-per-thread  50
          timeout-ms         5000
          pool               (image-buffer/->pool {:max-arrays thread-count})
          ;; A barrier so all threads start at the same moment (genuine overlap, so the "<= thread-count allocations"
          ;; assertion exercises real concurrency). `await` is bounded and the worker reaches it directly, so a thread
          ;; that throws can't strand the others on the barrier.
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

(deftest sweep-drains-to-zero-test
  (testing "sweep! drops idle arrays so memory is reclaimed when rendering stops"
    (let [p (image-buffer/->pool)]
      (image-buffer/release p (image-buffer/acquire p 480 480))
      (image-buffer/release p (image-buffer/acquire p 481 481))
      (is (pos? (:idle (image-buffer/stats p))) "arrays are pooled before the sweep")
      (image-buffer/sweep! p)
      (is (= 0 (:idle (image-buffer/stats p))) "sweep drains the pool to zero")
      ;; and rendering after a sweep just repopulates
      (image-buffer/release p (image-buffer/acquire p 480 480))
      (is (= 1 (:idle (image-buffer/stats p))) "post-sweep acquire/release repopulates"))))

(deftest stats-idle-reflects-reality-test
  (testing "reported idle count matches reality and never goes negative"
    (let [p (image-buffer/->pool)]
      (dotimes [i 20]
        (let [img (image-buffer/acquire p (+ 600 (mod i 3)) 300)]
          (when (even? i) (image-buffer/release p img))))
      (let [idle (:idle (image-buffer/stats p))]
        (is (>= idle 0) "idle count is never negative")
        (is (<= idle (:max-arrays (image-buffer/->pool))) "idle never exceeds the retention cap")))))

(deftest release-nil-is-safe-test
  (is (nil? (image-buffer/release (image-buffer/->pool) nil))))
