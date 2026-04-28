(ns ^:parallel metabase.warehouses-rest.metadata-file-import.id-map-test
  (:require
   [clojure.test :refer :all]
   [metabase.warehouses-rest.metadata-file-import.id-map :as id-map]))

(defmacro with-id-map
  [[sym] & body]
  `(let [~sym (id-map/create!)]
     (try ~@body (finally (id-map/close! ~sym)))))

(deftest empty-handle-test
  (with-id-map [m]
    (is (= 0 (id-map/size m)))
    (is (= -1 (id-map/get-target m 42)))
    (is (= -1 (id-map/get-target m 0)))))

(deftest single-pass-commit-test
  (with-id-map [m]
    (id-map/append! m 100 1)
    (id-map/append! m 200 2)
    (id-map/append! m 50  3)
    (testing "pending appends not visible until commit-pass!"
      (is (= 0  (id-map/size m)))
      (is (= -1 (id-map/get-target m 100))))
    (id-map/commit-pass! m)
    (is (= 3 (id-map/size m)))
    (is (= 1  (id-map/get-target m 100)))
    (is (= 2  (id-map/get-target m 200)))
    (is (= 3  (id-map/get-target m 50)))
    (is (= -1 (id-map/get-target m 999)))
    (is (= -1 (id-map/get-target m 0)))))

(deftest multi-pass-test
  (with-id-map [m]
    (testing "pass 1: 100 entries"
      (doseq [i (range 100)]
        (id-map/append! m (* i 10) (+ 1000 i)))
      (id-map/commit-pass! m)
      (is (= 100  (id-map/size m)))
      (is (= 1000 (id-map/get-target m 0)))
      (is (= 1099 (id-map/get-target m 990))))
    (testing "pass 2: 100 more entries with sources interleaved into pass-1 gaps"
      (doseq [i (range 100)]
        (id-map/append! m (+ 5 (* i 10)) (+ 2000 i)))
      (id-map/commit-pass! m)
      (is (= 200 (id-map/size m))))
    (testing "pass-1 entries still resolve after pass 2"
      (is (= 1000 (id-map/get-target m 0)))
      (is (= 1050 (id-map/get-target m 500))))
    (testing "pass-2 entries resolve"
      (is (= 2000 (id-map/get-target m 5)))
      (is (= 2099 (id-map/get-target m 995))))
    (testing "gaps still miss"
      (is (= -1 (id-map/get-target m 1)))
      (is (= -1 (id-map/get-target m 9)))
      (is (= -1 (id-map/get-target m 1000))))))

(deftest empty-buffer-commit-is-noop-test
  (with-id-map [m]
    (id-map/commit-pass! m)
    (is (= 0 (id-map/size m)))
    (id-map/append! m 1 2)
    (id-map/commit-pass! m)
    (is (= 1 (id-map/size m)))
    (testing "second commit with no appends is a no-op"
      (id-map/commit-pass! m)
      (is (= 1 (id-map/size m)))
      (is (= 2 (id-map/get-target m 1))))))

(deftest random-shuffle-10k-test
  (with-id-map [m]
    (let [n        10000
          pairs    (mapv (fn [i] [(* (inc i) 7) (+ 100000 i)]) (range n))
          shuffled (shuffle pairs)]
      (doseq [[s t] shuffled]
        (id-map/append! m s t))
      (id-map/commit-pass! m)
      (is (= n (id-map/size m)))
      (testing "every pair resolves"
        (doseq [[s t] pairs]
          (is (= t (id-map/get-target m s))
              (str "src=" s " expected target=" t))))
      (testing "non-existent srcs miss"
        (doseq [s [-1 0 1 2 3 4 5 6 (* 7 (inc n)) Long/MAX_VALUE]]
          (is (= -1 (id-map/get-target m s))
              (str "src=" s " should miss")))))))

(deftest random-shuffle-multi-pass-100k-test
  (with-id-map [m]
    (let [n-per-pass 25000
          n-passes   4
          pairs      (mapv (fn [i] [(* (inc i) 11) (+ 500000 i)])
                           (range (* n-per-pass n-passes)))
          shuffled   (shuffle pairs)]
      (testing "stream the pairs across multiple passes"
        (doseq [batch (partition n-per-pass shuffled)]
          (doseq [[s t] batch]
            (id-map/append! m s t))
          (id-map/commit-pass! m)))
      (is (= (* n-per-pass n-passes) (id-map/size m)))
      (testing "every pair resolves regardless of which pass committed it"
        (doseq [[s t] pairs]
          (is (= t (id-map/get-target m s))))))))

(deftest cleanup-on-close-deletes-temp-file-test
  (let [m (id-map/create!)
        f (id-map/file m)]
    (is (.exists f) "temp file exists after create!")
    (id-map/append! m 1 2)
    (id-map/commit-pass! m)
    (is (.exists f) "temp file still exists after commit-pass!")
    (id-map/close! m)
    (is (not (.exists f)) "temp file is deleted after close!")))

(deftest double-close-is-safe-test
  (let [m (id-map/create!)]
    (id-map/close! m)
    (id-map/close! m)
    (is true "second close did not throw")))

(deftest get-target-on-closed-handle-throws-test
  (let [m (id-map/create!)]
    (id-map/close! m)
    (is (thrown? Exception (id-map/get-target m 42))
        "lookups on a closed handle should throw, not silently miss")))
