(ns metabase.query-processor-test.generative-test
  "Query processor generative tests.

  WIPWIPWIP"
  (:require
   [clojure.test :refer [deftest is testing]]
   [environ.core :refer [env]]
   [metabase.config :as config]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.test-util.generators :as lib.tu.gen]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.util.random :as tu.rng]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(comment

  ;; this fails -- probably a legit bug!!! -- non-reproducible from FE
  (alter-var-root #'env assoc
                  :mb-test-run-generative-tests "false"
                  :mb-test-query-iteration-count "20" #_"100"
                  :mb-test-run-seed "751627398584065715")
  
  (alter-var-root #'env assoc
                  :mb-test-run-generative-tests "true"
                  :mb-test-query-iteration-count "20" #_"100"
                  :mb-test-run-seed "-8532424533502079314")
  
  (alter-var-root #'env assoc :mb-test-qgen-run "true")
  

  )

  ;; for qp generative testing there should be dedicated config namespace
  ;; should be part of init sequence for tests
  ;; should eg. parse json, that will be stored in `run-spec`
(deftest ^:parallel basic-gen-query-test-2
  (when (config/config-bool :mb-test-qgen-run)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          ;; TODO: Probably common config ns
          iterations (or (config/config-int :mb-test-query-iterations) 
                         100)]
      (tu.rng/with-generator [iterations query (try (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                                        lib.tu.gen/random-query-from)
                                                    (catch Throwable _t
                                                      (log/error "Initialization failed")
                                                      (log/errorf "Seed: %d" &seed)
                                                      :error))]
        (try
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
                (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result)))))))
          (catch Throwable t
            (log/error  "Test: `CURRENT_TEST_NAME` failed")
            (log/errorf "Seed: %d" &seed)
            (log/errorf "Query:\n %s" (with-out-str (clojure.pprint/pprint query)))))))))

