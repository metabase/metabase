(ns metabase.query-processor.build-test
  "Tests/examples of the new QP/`qp.build`."
  (:require [clojure.core.async :as a]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.query-processor.build :as qp.build]))

;; NOCOMMIT - examples for new reducing QP code

(defn mbql-example
  "An MBQL query ran via low-level `process-query` that includes multiple aggregations with the same name and a filter
  with a param."
  []
  (qp/process-query
   (driver/with-driver :postgres
     {:database (mt/id)
      :type     :query
      :query    {:source-table (mt/id :venues)
                 :aggregation  [[:sum (mt/id :venues :price)] [:sum (mt/id :venues :id)]]
                 :breakout     [(mt/id :venues :price)]
                 :filter       [:!= [:field-id (mt/id :venues :name)] "Mohawk Bend"]}})))

(defn native-example
  "A native query with a parameter. Triggers a sampling reducing fn in `annotate` that takes first 100 rows to determine
  results metadata."
  []
  (qp/process-query
   (driver/with-driver :postgres
     {:database (mt/id)
      :type     :native
      :native   {:query  "SELECT * FROM venues WHERE name <> ? LIMIT 5;"
                 :params ["Mohawk Bend"]}})))

(defn userland-example
  "MBQL query ran via higher-level userland mechanism that includes a cumulative count aggregation (added during
  reduction) as well as a `:max-rows` constraint."
  []
  (qp/process-query-and-save-with-max-results-constraints!
   (driver/with-driver :postgres
     {:database    (mt/id)
      :type        :query
      :constraints {:max-results 3}
      :query       {:source-table (mt/id :checkins)
                    :aggregation  [[:cum-count]]
                    :breakout     [[:datetime-field [:field-id (mt/id :checkins :date)] :month]]
                    :limit        5}})
   {}))

(defn- print-rows-rff [metadata]
  (println "results meta ->\n" (u/pprint-to-str 'blue metadata))
  (fn
    ([] 0)
    ([row-count] row-count)
    ([row-count row]
     (locking println (println (u/format-color 'yellow "ROW %d ->" (inc row-count)) (pr-str row)))
     (inc row-count))))

(defn print-rows-example
  "An example that prints rows as they come in (async)."
  []
  (qp/process-query-async
   (driver/with-driver :postgres
     {:database (mt/id)
      :type     :query
      :query    {:source-table (mt/id :venues), :limit 20}})
   print-rows-rff))

(defn- print-rows-to-writer-rff [filename]
  (qp.build/in-context-rff
   (fn [reduce-with-rff]
     (try
       (locking println (println (format "<Opening writer to %s>" (pr-str filename))))
       (with-open [w (io/writer filename)]
         (reduce-with-rff
          (fn [metadata]
            (fn
              ([] 0)
              ([row-count] {:rows row-count})
              ([row-count row]
               (.write w (format "ROW %d -> %s\n" (inc row-count) (pr-str row)))
               (inc row-count))))))
       (finally
         (locking println (println (format "<Closed writer to %s>" (pr-str filename)))))))))

(defn print-rows-to-file-example
  "Writes results to a file."
  []
  (qp/process-query
   (driver/with-driver :postgres
     {:database (mt/id)
      :type     :query
      :query    {:source-table (mt/id :venues), :limit 20}})
   (print-rows-to-writer-rff "/tmp/results.txt")))

(defn- maps-rff [metadata]
  (let [ks (mapv (comp keyword :name) (:cols metadata))]
    (fn
      ([] [])

      ([acc] {:data (merge metadata {:rows acc})})

      ([acc row]
       (conj acc (zipmap ks row))))))

(deftest maps-test
  (testing "Example using an alternative reducing function that returns rows as a sequence of maps."
    (is (= [{:ID 1, :CATEGORY_ID 4,  :LATITUDE 10.0646, :LONGITUDE -165.374, :NAME "Red Medicine",          :PRICE 3}
            {:ID 2, :CATEGORY_ID 11, :LATITUDE 34.0996, :LONGITUDE -118.329, :NAME "Stout Burgers & Beers", :PRICE 2}]
           (mt/rows
             (qp/process-query
              {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :venues), :limit 2, :order-by [[:asc (mt/id :venues :id)]]}}
              maps-rff))))))

(deftest cancel-chan-test
  "Example of canceling a query early before results are returned."
  []
  (letfn [(process-query []
            (qp/process-query-async
             {:database (mt/id)
              :type     :native
              :native   {:query "SELECT * FROM users ORDER BY id ASC LIMIT 5;"}}
             (fn [metadata]
               (println "Sleeping for 1000!")
               (Thread/sleep 1000)
               (qp.build/default-rff metadata))))]
    (let [{:keys [canceled-chan finished-chan]} (process-query)]
      (a/put! canceled-chan :cancel)
      (is (= :canceled
             (a/<!! finished-chan))))
    (let [{:keys [finished-chan]} (process-query)]
      (future
        (Thread/sleep 50)
        (a/close! finished-chan))
      (is (= nil
             (a/<!! finished-chan))))))

(deftest exceptions-test
  (testing "Test a query that throws an Exception."
    (is (thrown?
         Throwable
         (qp/process-query
          {:database (mt/id)
           :type     :native
           :native   {:query "SELECT asdasdasd;"}}))))
  (testing "Test when an Exception is thrown in the reducing fn."
    (is (thrown-with-msg?
         Throwable #"Cannot open file"
         (qp/process-query
          {:database (mt/id)
           :type     :query
           :query    {:source-table (mt/id :venues), :limit 20}}
          (qp.build/in-context-rff
           (fn [reduce-with-rff]
             (throw (Exception. "Cannot open file")))))))))

(deftest custom-qp-test
  (testing "Rows don't actually have to be reducible. And you can build your own QP with your own middleware."
    (is (= {:cols [{:name "n"}]
            :rows [{:n 1} {:n 2} {:n 3} {:n 4} {:n 5}]}
           ((qp.build/sync-query-processor
             (qp.build/async-query-processor
              (qp.build/base-query-processor
               (fn [_ _ _ results-fn]
                 (results-fn {:cols [{:name "n"}]} [[1] [2] [3] [4] [5]]))
               [])))
            {}
            maps-rff)))))
