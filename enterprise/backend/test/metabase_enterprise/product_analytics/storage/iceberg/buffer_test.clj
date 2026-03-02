(ns metabase-enterprise.product-analytics.storage.iceberg.buffer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.buffer :as buffer]))

(deftest ^:parallel create-buffer-test
  (testing "create-buffer returns a map with :queue and :count, size is 0"
    (let [buf (buffer/create-buffer)]
      (is (map? buf))
      (is (contains? buf :queue))
      (is (contains? buf :count))
      (is (zero? (buffer/size buf))))))

(deftest ^:parallel offer-and-size-test
  (testing "offer! adds items and size increments correctly"
    (let [buf (buffer/create-buffer)]
      (is (true? (buffer/offer! buf {:event "a"})))
      (is (= 1 (buffer/size buf)))
      (buffer/offer! buf {:event "b"})
      (buffer/offer! buf {:event "c"})
      (is (= 3 (buffer/size buf))))))

(deftest ^:parallel drain-returns-all-items-test
  (testing "drain! returns all offered items as a vector and empties the buffer"
    (let [buf   (buffer/create-buffer)
          items [{:id 1} {:id 2} {:id 3}]]
      (doseq [item items]
        (buffer/offer! buf item))
      (let [drained (buffer/drain! buf)]
        (is (= items drained))
        (is (zero? (buffer/size buf)))))))

(deftest ^:parallel drain-empty-buffer-test
  (testing "drain! on an empty buffer returns []"
    (let [buf (buffer/create-buffer)]
      (is (= [] (buffer/drain! buf))))))

(deftest ^:parallel concurrent-offer-and-drain-test
  (testing "concurrent offers and drains do not lose items"
    (let [buf         (buffer/create-buffer)
          n-threads   8
          n-per-thread 100
          total       (* n-threads n-per-thread)
          all-items   (atom [])]
      ;; Offer from multiple threads concurrently
      (->> (range n-threads)
           (mapv (fn [t]
                   (future
                     (dotimes [i n-per-thread]
                       (buffer/offer! buf {:thread t :item i})))))
           (run! deref))
      ;; Drain everything
      (swap! all-items into (buffer/drain! buf))
      (is (= total (count @all-items))
          "All items should be recovered after concurrent offers"))))

(deftest start-and-stop-flush-task-test
  (testing "start-flush-task! calls flush-fn, stop-flush-task! performs final flush"
    (let [call-count (atom 0)
          flush-fn   #(swap! call-count inc)
          task       (buffer/start-flush-task! flush-fn 1)]
      (is (map? task))
      (is (contains? task :executor))
      (is (contains? task :future))
      ;; Wait enough time for at least one scheduled flush
      (Thread/sleep 2500)
      (let [count-before-stop @call-count]
        (is (pos? count-before-stop) "flush-fn should have been called at least once")
        (buffer/stop-flush-task! task flush-fn)
        ;; stop-flush-task! calls flush-fn one final time
        (is (> @call-count count-before-stop)
            "stop should trigger a final flush")))))
