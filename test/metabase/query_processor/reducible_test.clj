(ns ^:mb/once metabase.query-processor.reducible-test
  "Some basic tests around very-low-level QP logic, and some of the new features of the QP (such as support for
  different reducing functions.)"
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- print-rows-rff [_metadata]
  (fn
    ([] 0)

    ([acc]
     (flush)
     acc)

    ([row-count row]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (printf "ROW %d -> %s\n" (inc row-count) (pr-str row))
     (inc row-count))))

(deftest ^:parallel print-rows-test
  (testing "An example of using a reducing function that prints rows as they come in."
    (let [qp-result (atom nil)
          output    (str/split-lines
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

(deftest ^:parallel write-rows-to-file-test
  (mt/with-temp-file [filename]
    (try
      (binding [qp.pipeline/*reduce* (let [orig qp.pipeline/*reduce*]
                                       (fn [rff metadata reducible-rows]
                                         (with-open [w (io/writer filename)]
                                           (binding [*out* w]
                                             (orig rff metadata reducible-rows)))))]
        (is (= 3
               (qp/process-query
                {:database (mt/id)
                 :type     :query
                 :query    {:source-table (mt/id :venues), :limit 3}}
                print-rows-rff))))
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

(deftest ^:parallel maps-test
  (testing "Example using an alternative reducing function that returns rows as a sequence of maps."
    (is (= [{:ID 1, :CATEGORY_ID 4,  :LATITUDE 10.0646, :LONGITUDE -165.374, :NAME "Red Medicine",          :PRICE 3}
            {:ID 2, :CATEGORY_ID 11, :LATITUDE 34.0996, :LONGITUDE -118.329, :NAME "Stout Burgers & Beers", :PRICE 2}]
           (mt/rows
            (qp/process-query
             {:database (mt/id)
              :type     :query
              :query    {:source-table (mt/id :venues), :limit 2, :order-by [[:asc (mt/id :venues :id)]]}}
             maps-rff))))))
