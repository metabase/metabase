(ns metabase.query-processor-test.constraints-test
  "Test for MBQL `:constraints`"
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor :as qp]
             [test :as mt]]))

(defn- mbql-query []
  (mt/mbql-query venues
    {:fields   [$name]
     :order-by [[:asc $id]]}))

(defn- native-query []
  (qp/query->native (mbql-query)))

(deftest max-results-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do `:max-results` constraints affect the number of rows returned by native queries?"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
               (qp/process-query
                {:database    (mt/id)
                 :type        :native
                 :native      (native-query)
                 :constraints {:max-results 5}})))))

    (testing (str "does it also work when running via `process-query-and-save-with-max-results-constraints!`, the "
                  "function that powers endpoints like `POST /api/dataset`?")
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
               (qp/process-query-and-save-with-max-results-constraints!
                {:database    (mt/id)
                 :type        :native
                 :native      (native-query)
                 :constraints {:max-results 5}}
                {:context :question})))))))

(deftest override-limit-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "constraints should override MBQL `:limit` if lower"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]]
             (mt/rows
               (qp/process-query
                (-> (mbql-query)
                    (assoc-in [:query :limit] 10)
                    (assoc :constraints {:max-results 3})))))))

    (testing "However if `:limit` is lower than `:constraints` we should not return more than the `:limit`"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
               (qp/process-query
                (-> (mbql-query)
                    (assoc-in [:query :limit] 5)
                    (assoc :constraints {:max-results 10})))))))))
