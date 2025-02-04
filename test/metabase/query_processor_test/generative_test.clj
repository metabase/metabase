(ns metabase.query-processor-test.generative-test
  "Query processor generative tests.

  WIPWIPWIP"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util.generators :as lib.tu.gen]
   [metabase.lib.test-util.random :as ra]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel basic-gen-query-test
  (ra/with-rand
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (doseq [query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib.tu.gen/random-queries-from 1 #_30))]
        (mt/with-temp
          [:model/Card
           {id :id}
           {:dataset_query (lib.convert/->legacy-MBQL query)}]
          (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
            (testing "Query execution was succesfully completed"
              (is (= :completed
                     (:status result))))
            (testing "At least one column was returned"
              (is (<= 1 (count (mt/cols result))))
              (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result)))))))))))
