(ns metabase.util.lru-ttl-cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.lru-ttl-cache :as lru-ttl]))

(set! *warn-on-reflection* true)

;;; Not `^:parallel`: every cache operation is named with a `!`, which the deftest linter reads as
;;; unsafe to run concurrently. These caches are local to each test.

(defn- counting-thunk [calls v]
  (fn [] (swap! calls inc) v))

(deftest serves-a-cached-value-without-recomputing-test
  (let [c     (lru-ttl/cache {:ttl-ms 60000})
        calls (atom 0)]
    (is (= :v (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))))
    (is (= :v (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))))
    (is (= 1 @calls))))

(deftest caches-nil-as-a-value-test
  (testing "a cached nil is a hit, not a miss"
    (let [c     (lru-ttl/cache {:ttl-ms 60000})
          calls (atom 0)]
      (is (nil? (lru-ttl/get-or-compute! c :k (counting-thunk calls nil))))
      (is (nil? (lru-ttl/get-or-compute! c :k (counting-thunk calls nil))))
      (is (= 1 @calls)))))

(deftest recomputes-once-the-ttl-passes-test
  ;; `core.cache` reads the system clock itself, so this waits rather than advancing a clock.
  (let [c     (lru-ttl/cache {:ttl-ms 60})
        calls (atom 0)]
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (is (= 1 @calls) "still fresh")
    (Thread/sleep 120)
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (is (= 2 @calls) "expired")))

(deftest evicts-the-least-recently-used-entry-test
  (let [c     (lru-ttl/cache {:ttl-ms 60000 :threshold 2})
        calls (atom 0)]
    (lru-ttl/get-or-compute! c :a (counting-thunk calls :a))
    (lru-ttl/get-or-compute! c :b (counting-thunk calls :b))
    (testing "touching :a makes :b the least recently used"
      (lru-ttl/get-or-compute! c :a (counting-thunk calls :a))
      (lru-ttl/get-or-compute! c :c (counting-thunk calls :c))
      (is (= 3 @calls))
      (lru-ttl/get-or-compute! c :a (counting-thunk calls :a))
      (is (= 3 @calls) ":a survived")
      (lru-ttl/get-or-compute! c :b (counting-thunk calls :b))
      (is (= 4 @calls) ":b was evicted"))))

(deftest does-not-cache-values-rejected-by-cache-when-test
  (let [c     (lru-ttl/cache {:ttl-ms 60000 :cache-when #{:good}})
        calls (atom 0)]
    (testing "a rejected value is still returned, just not remembered"
      (is (= :bad (lru-ttl/get-or-compute! c :k (counting-thunk calls :bad))))
      (is (= :bad (lru-ttl/get-or-compute! c :k (counting-thunk calls :bad))))
      (is (= 2 @calls)))
    (testing "an accepted value is remembered"
      (lru-ttl/get-or-compute! c :j (counting-thunk calls :good))
      (lru-ttl/get-or-compute! c :j (counting-thunk calls :good))
      (is (= 3 @calls)))))

(deftest forgets-on-eviction-test
  (let [c     (lru-ttl/cache {:ttl-ms 60000})
        calls (atom 0)]
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (lru-ttl/evict! c :k)
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (is (= 2 @calls))
    (lru-ttl/invalidate-all! c)
    (lru-ttl/get-or-compute! c :k (counting-thunk calls :v))
    (is (= 3 @calls))))

(deftest rejects-a-missing-or-nonsensical-ttl-test
  (testing "a bad ttl is an ordinary exception a caller can catch, not an AssertionError"
    (doseq [ttl [nil 0 -1 "60000"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"positive :ttl-ms"
                            (lru-ttl/cache {:ttl-ms ttl}))
          (str "ttl-ms " (pr-str ttl))))))
