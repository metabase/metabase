(ns metabase.query-processor-test.generative-test
  "Query processor generative tests.

  WIPWIPWIP"
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.config :as config]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util.generators :as lib.tu.gen]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.gentest :as gentest]
   [metabase.test.util.random :as tu.rng]))

(set! *warn-on-reflection* true)

(deftest with-gentest-test
  (when (config/config-bool :mb-test-qgen-run)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (gentest/with-gentest
        {:gentest.default-limit/seconds 5}
        [base-query (lib/query mp (tu.rng/rand-nth (lib.metadata/tables mp)))
         iterations (inc (tu.rng/rand-int 20))]
        (doseq [query (lib.tu.gen/random-queries-from base-query iterations)]
          (mt/with-temp
            [:model/Card
             {id :id}
             {:dataset_query (lib.convert/->legacy-MBQL query)}]
            (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
              (testing "Successful query execution"
                (is (= :completed
                       (:status result))))
              (testing "At least one column returned"
                (is (<= 1 (count (mt/cols result))))
                (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))))))))))