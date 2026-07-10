(ns ^:mb/driver-tests metabase.query-processor.constraints-test
  "Test for MBQL `:constraints`"
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(defn- mbql-query []
  (let [mp          (mt/metadata-provider)
        venues      (lib.metadata/table mp (mt/id :venues))
        venues-name (lib.metadata/field mp (mt/id :venues :name))
        venues-id   (lib.metadata/field mp (mt/id :venues :id))]
    (-> (lib/query mp venues)
        (lib/with-fields [venues-name])
        (lib/order-by venues-id))))

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
                   (lib/limit 10)
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
                   (lib/limit 5)
                   (assoc :constraints {:max-results 10})))))))))
