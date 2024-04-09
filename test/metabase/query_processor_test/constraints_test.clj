(ns metabase.query-processor-test.constraints-test
  "Test for MBQL `:constraints`"
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(defn- mbql-query []
  (mt/mbql-query venues
    {:fields   [$name]
     :order-by [[:asc $id]]}))

(defn- native-query []
  (qp.compile/compile (mbql-query)))

(deftest ^:parallel max-results-test
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
                :constraints {:max-results 5}})))))))

(deftest ^:parallel max-results-userland-query-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "Do max results constraints work when running a userland query e.g. like we use for endpoints like `POST /api/dataset`?"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]
              ["Wurstküche"]
              ["Brite Spot Family Restaurant"]]
             (mt/rows
              (qp/process-query
               (qp/userland-query-with-default-constraints
                {:database    (mt/id)
                 :type        :native
                 :native      (native-query)
                 :constraints {:max-results 5}}
                {:context :question}))))))))

(deftest ^:parallel override-limit-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "constraints should override MBQL `:limit` if lower"
      (is (= [["Red Medicine"]
              ["Stout Burgers & Beers"]
              ["The Apple Pan"]]
             (mt/rows
              (qp/process-query
               (-> (mbql-query)
                   (assoc-in [:query :limit] 10)
                   (assoc :constraints {:max-results 3})))))))))

(deftest ^:parallel override-limit-test-2
  (mt/test-drivers (mt/normal-drivers)
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
