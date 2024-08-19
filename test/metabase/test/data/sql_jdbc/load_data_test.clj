(ns metabase.test.data.sql-jdbc.load-data-test
  "Tests for [[metabase.test.data.sql-jdbc.load-data]]."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.test.data.dataset-definitions]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql-jdbc.load-data :as sql-jdbc.load-data]))

(deftest ^:parallel add-ids-xform-test
  (is (= [{:name "A", :id 1} {:name "B", :id 2} {:name "C", :id 3} {:name "D", :id 4}]
         (into []
               (sql-jdbc.load-data/add-ids-xform)
               [{:name "A"} {:name "B"} {:name "C"} {:name "D"}]))))

(deftest ^:parallel reducible-chunked-rows-test
  (letfn [(reducible-chunks* [chunk-size]
            (#'sql-jdbc.load-data/reducible-chunked-rows
             [{:a 1} {:b 2} {:c 3} {:d 4}]
             chunk-size
             (sql-jdbc.load-data/add-ids-xform)
             (map (fn [chunk]
                    (mapv (fn [row]
                            (assoc row ::chunk chunk))
                          chunk)))))]
    (testing "unchunked"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:c 3, :id 3, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* nil)))))
    (testing "chunk size = 5"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:c 3, :id 3, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:a 1, :id 1} {:b 2, :id 2} {:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* 5)))))
    (testing "chunk size = 2"
      (is (= [[{:a 1, :id 1, ::chunk [{:a 1, :id 1} {:b 2, :id 2}]}
               {:b 2, :id 2, ::chunk [{:a 1, :id 1} {:b 2, :id 2}]}]
              [{:c 3, :id 3, ::chunk [{:c 3, :id 3} {:d 4, :id 4}]}
               {:d 4, :id 4, ::chunk [{:c 3, :id 3} {:d 4, :id 4}]}]]
             (into [] (reducible-chunks* 2)))))))

(driver/register! ::h2-unchunked, :parent :h2)

(defmethod sql-jdbc.load-data/chunk-size ::h2-unchunked
  [_driver _dbdef _tabledef]
  nil)

(driver/register! ::h2-chunked, :parent :h2)

(defmethod sql-jdbc.load-data/chunk-size ::h2-chunked
  [_driver _dbdef _tabledef]
  5)

(deftest ^:parallel reducible-chunks-test
  (let [dbdef    (tx/get-dataset-definition metabase.test.data.dataset-definitions/test-data)
        tabledef (m/find-first
                  #(= (:table-name %) "categories")
                  (:table-definitions dbdef))]
    (is (some? tabledef))
    (letfn [(chunks [driver]
              (into []
                    (comp (take 2)
                          (map (fn [chunk]
                                 (into [] (take 3) chunk))))
                    (#'sql-jdbc.load-data/reducible-chunks driver dbdef tabledef)))]
      (testing ::h2-unchunked
        ;; only one chunk, we took the first 3 rows
        (is (= [[{:name "African"}
                 {:name "American"}
                 {:name "Artisan"}]]
               (chunks ::h2-unchunked))))
      (testing ::h2-chunked
        ;; many chunks of size 5, we took the first 3 rows from the first 2 chunks.
        (is (= [[{:name "African"}
                 {:name "American"}
                 {:name "Artisan"}]
                [{:name "Bakery"}
                 {:name "Bar"}
                 {:name "Beer Garden"}]]
               (chunks ::h2-chunked)))))))

(driver/register! ::h2-large-chunk-size, :parent :h2)

(defmethod sql-jdbc.load-data/chunk-size ::h2-large-chunk-size
  [_driver _dbdef _tabledef]
  1000)

(deftest ^:parallel large-chunk-size-test
  (testing "Make sure we load EVERY row if we have chunks less than chunk-size"
    (let [driver   ::h2-large-chunk-size
          dbdef    (tx/get-dataset-definition metabase.test.data.dataset-definitions/test-data)
          tabledef (fn [table-name]
                     (m/find-first
                      #(= (:table-name %) table-name)
                      (:table-definitions dbdef)))
          num-rows (fn [table-name]
                     (transduce
                      (keep count)
                      +
                      0
                      (#'sql-jdbc.load-data/reducible-chunks driver dbdef (tabledef table-name))))]
      (assert (some? tabledef))
      (are [table-name num-expected-rows] (= num-expected-rows
                                             (num-rows table-name))
        "people" 2500
        "venues" 100))))
