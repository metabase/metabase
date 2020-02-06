(ns metabase.query-processor.build-test
  "Some basic tests around very-low-level QP logic in `qp.build`, and some of the new features of the QP (such as
  support for different reducing functions.)"
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.core.async :as a]
            [clojure.java.io :as io]
            [metabase
             [query-processor :as qp]
             [test :as mt]]
            [metabase.query-processor.build :as qp.build]
            [metabase.util.files :as u.files]))

(defn- print-rows-rff [metadata]
  (fn
    ([] 0)

    ([row-count]
     (flush)
     row-count)

    ([row-count row]
     (printf "ROW %d -> %s\n" (inc row-count) (pr-str row))
     (inc row-count))))

(deftest print-rows-test
  (testing "An example of using a reducing function that prints rows as they come in."
    (let [qp-result (atom nil)
          output (str/split-lines
                  (with-out-str
                    (reset! qp-result (qp/process-query
                                       {:database (mt/id)
                                        :type     :query
                                        :query    {:source-table (mt/id :venues), :limit 3}}
                                       print-rows-rff))))]
      (is (= 3
             @qp-result))
      (is (= ["ROW 1 -> [1 \"Red Medicine\" 4 10.0646 -165.374 3]"
              "ROW 2 -> [2 \"Stout Burgers & Beers\" 11 34.0996 -118.329 2]"
              "ROW 3 -> [3 \"The Apple Pan\" 11 34.0406 -118.428 2]"]
             output)))))

(defn- print-rows-to-writer-rff [filename]
  (qp.build/decorated-reducing-fn
   (fn [reduce-with-rff]
     (try
       (locking println (println (format "<Opening writer to %s>" (pr-str filename))))
       (with-open [w (io/writer filename)]
         (reduce-with-rff
          (fn [metadata]
            (fn
              ([] 0)

              ([row-count]
               (.flush w)
               {:rows row-count})

              ([row-count row]
               (.write w (format "ROW %d -> %s\n" (inc row-count) (pr-str row)))
               (inc row-count))))))
       (finally
         (locking println (println (format "<Closed writer to %s>" (pr-str filename)))))))))

(deftest write-rows-to-file-test
  (let [filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") "out.txt"))]
    (is (= {:rows 3}
           (-> (qp/process-query
                {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues), :limit 3}}
                (print-rows-to-writer-rff filename))
               (select-keys [:rows]))))
    (is (= ["ROW 1 -> [1 \"Red Medicine\" 4 10.0646 -165.374 3]"
            "ROW 2 -> [2 \"Stout Burgers & Beers\" 11 34.0996 -118.329 2]"
            "ROW 3 -> [3 \"The Apple Pan\" 11 34.0406 -118.428 2]"]
           (str/split-lines (slurp filename))))))

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

(deftest cancelation-test
  (testing "Example of canceling a query early before results are returned."
    (letfn [(process-query []
              (qp/process-query-async
               {:database (mt/id)
                :type     :native
                :native   {:query "SELECT * FROM users ORDER BY id ASC LIMIT 5;"}}
               (fn [metadata]
                 (Thread/sleep 1000)
                 (qp.build/default-rff metadata))))]
      (let [{:keys [canceled-chan finished-chan]} (process-query)]
        (a/put! canceled-chan :cancel)
        (is (= {:status :interrupted}
               (a/<!! finished-chan))))
      (let [{:keys [finished-chan]} (process-query)]
        (future
          (Thread/sleep 50)
          (a/close! finished-chan))
        (is (= nil
               (a/<!! finished-chan))))))

  (testing "With a ridiculous timeout (1 ms) we should still get a result"
    (let [qp (qp.build/sync-query-processor
              (qp.build/async-query-processor
               (qp.build/base-query-processor
                (fn [_ _ _ respond]
                  (Thread/sleep 10)
                  (respond {} []))
                nil)
               1))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Timed out after 1000\.0 µs\."
           (qp {}))))))

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
          (qp.build/decorated-reducing-fn
           (fn [_]
             (throw (Exception. "Cannot open file")))))))))

(deftest custom-qp-test
  (testing "Rows don't actually have to be reducible. And you can build your own QP with your own middleware."
    (is (= {:data {:cols [{:name "n"}]
                   :rows [{:n 1} {:n 2} {:n 3} {:n 4} {:n 5}]}}
           ((qp.build/sync-query-processor
             (qp.build/async-query-processor
              (qp.build/base-query-processor
               (fn [_ _ _ results-fn]
                 (results-fn {:cols [{:name "n"}]} [[1] [2] [3] [4] [5]]))
               [])))
            {}
            maps-rff)))))
