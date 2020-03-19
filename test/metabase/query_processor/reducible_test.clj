(ns metabase.query-processor.reducible-test
  "Some basic tests around very-low-level QP logic, and some of the new features of the QP (such as support for
  different reducing functions.)"
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [metabase
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.reducible :as qp.reducible]
            [metabase.util.files :as u.files]))

(deftest quit-test
  (testing "async-qp should properly handle `quit` exceptions"
    (let [out-chan ((qp.reducible/async-qp (fn [query rff context]
                                             (throw (qp.reducible/quit ::bye)))) {})]
      (is (= ::bye
             (metabase.test/wait-for-result out-chan))))))

(defn- print-rows-rff [metadata]
  (fn
    ([] 0)

    ([acc]
     (flush)
     acc)

    ([row-count row]
     (printf "ROW %d -> %s\n" (inc row-count) (pr-str row))
     (inc row-count))))

(deftest print-rows-test
  (testing "An example of using a reducing function that prints rows as they come in."
    (let [qp-result (atom nil)
          output    (str/split-lines
                     (with-out-str
                       (reset! qp-result (qp/process-query
                                          {:database (mt/id)
                                           :type     :query
                                           :query    {:source-table (mt/id :venues), :limit 3}}
                                          {:rff print-rows-rff}))))]
      (is (= 3
             @qp-result))
      (is (= ["ROW 1 -> [1 \"Red Medicine\" 4 10.0646 -165.374 3]"
              "ROW 2 -> [2 \"Stout Burgers & Beers\" 11 34.0996 -118.329 2]"
              "ROW 3 -> [3 \"The Apple Pan\" 11 34.0406 -118.428 2]"]
             output)))))

(defn print-rows-to-writer-context [filename]
  (letfn [(reducef* [rff context metadata reducible-rows]
            (with-open [w (io/writer filename)]
              (binding [*out* w]
                (context.default/default-reducef rff context metadata reducible-rows))))]
    {:reducef reducef*
     :rff     print-rows-rff}))

(deftest write-rows-to-file-test
  (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") "out.txt"))]
    (try
      (is (= 3
             (qp/process-query
              {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :venues), :limit 3}}
              (print-rows-to-writer-context filename))))
      (is (= ["ROW 1 -> [1 \"Red Medicine\" 4 10.0646 -165.374 3]"
              "ROW 2 -> [2 \"Stout Burgers & Beers\" 11 34.0996 -118.329 2]"
              "ROW 3 -> [3 \"The Apple Pan\" 11 34.0406 -118.428 2]"]
             (str/split-lines (slurp filename))))
      (finally
        (u/ignore-exceptions
          (.delete (io/file filename)))))))

(defn- maps-rff [metadata]
  (let [ks (mapv (comp keyword :name) (:cols metadata))]
    (fn
      ([] {:data (assoc metadata :rows [])})

      ([acc] acc)

      ([acc row]
       (update-in acc [:data :rows] conj (zipmap ks row))))))

(deftest maps-test
  (testing "Example using an alternative reducing function that returns rows as a sequence of maps."
    (is (= [{:ID 1, :CATEGORY_ID 4,  :LATITUDE 10.0646, :LONGITUDE -165.374, :NAME "Red Medicine",          :PRICE 3}
            {:ID 2, :CATEGORY_ID 11, :LATITUDE 34.0996, :LONGITUDE -118.329, :NAME "Stout Burgers & Beers", :PRICE 2}]
           (mt/rows
             (qp/process-query
              {:database (mt/id)
               :type     :query
               :query    {:source-table (mt/id :venues), :limit 2, :order-by [[:asc (mt/id :venues :id)]]}}
              {:rff maps-rff}))))))

(deftest cancelation-test
  (testing "Example of canceling a query early before results are returned."
    (letfn [(process-query [canceled-chan timeout]
              ((qp.reducible/async-qp (fn [query rff {:keys [canceled-chan reducef], :as context}]
                                        (let [futur (future (reducef query rff context))]
                                          (a/go
                                            (when (a/<! canceled-chan)
                                              (future-cancel futur))))))
               {}
               {:canceled-chan canceled-chan
                :timeout       timeout
                :executef      (fn [_ _ _ respond]
                                 (Thread/sleep 500)
                                 (respond {} [[1]]))}))]
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (let [out-chan (process-query canceled-chan 1000)]
          (a/close! out-chan)
          (is (= ::qp.reducible/cancel
                 (first (a/alts!! [canceled-chan (a/timeout 500)]))))))
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (let [out-chan (process-query canceled-chan 1000)]
          (future
            (Thread/sleep 50)
            (a/close! out-chan))
          (is (= ::qp.reducible/cancel
                 (a/<!! canceled-chan)))
          (is (= nil
                 (a/<!! out-chan)))))
      (testing "With a ridiculous timeout (1 ms) we should still get a result"
        (mt/with-open-channels [canceled-chan (a/promise-chan)]
          (let [out-chan (process-query canceled-chan 1)
                result (first (a/alts!! [out-chan (a/timeout 1000)]))]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Timed out after 1000\.0 µs\."
                 (if (instance? Throwable result)
                   (throw result)
                   result)))))))))

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
          {:reducef (fn [& _]
                      (throw (Exception. "Cannot open file")))})))))

(deftest custom-qp-test
  (testing "Rows don't actually have to be reducible. And you can build your own QP with your own middleware."
    (is (= {:data {:cols [{:name "n"}]
                   :rows [{:n 1} {:n 2} {:n 3} {:n 4} {:n 5}]}}
           ((qp.reducible/sync-qp (qp.reducible/async-qp qp.reducible/pivot))
            {}
            {:executef (fn [_ _ _ respond]
                         (respond {:cols [{:name "n"}]}
                                  [[1] [2] [3] [4] [5]]))
             :rff      maps-rff})))))
