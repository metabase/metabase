(ns metabase.query-processor.generative-test
  "Query processor generative tests."
  (:require
   [clojure.test :refer [is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.generators :as lib.tu.gen]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.gentest :as gt]
   [metabase.test.util.generators.jvm :as tu.gen.jvm]
   [metabase.test.util.random :as tu.rng]))

(set! *warn-on-reflection* true)

(comment
  #_:clj-kondo/ignore
  (alter-var-root #'environ.core/env assoc
                  :mb-gentest-run "true"
                  :mb-gentest-context-seed "1"))

(defn- valid-col?
  [maybe-col]
  (and (map? maybe-col)
       ((every-pred :name :base_type :display_name) maybe-col)))

(gt/defgentest basic-query-execution-test
  (let [mp (mt/metadata-provider)]
    (gt/iterate
     #_{:gentest.default-limit/seconds 5}
     {:gentest.default-limit/iterations 1}
     [base-query (lib/query mp (tu.rng/rand-nth (lib.metadata/tables mp)))
      limit (inc (tu.rng/rand-int lib.tu.gen/sane-iterations-limit))]
     (doseq [query (lib.tu.gen/random-queries-from base-query limit)]
       (gt/testing ["query" query]
         (let [mp (lib.tu/mock-metadata-provider
                   mp
                   {:cards [{:id            1
                             :dataset-query query}]})
               result (qp/process-query (lib/query mp (lib.metadata/card mp 1)))]
           (testing "Successful query execution"
             (is (= :completed
                    (:status result))))
           (testing "At least one column returned"
             (is (<= 1 (count (mt/cols result))))
             (is (every? valid-col? (mt/cols result))))))))))

(gt/defgentest execution-with-cards-test
  (let [mp (mt/metadata-provider)]
    ;; TODO: What is the reasonable amount of cards to use in context? Hardcoding 8 for now as 8 tables are avail in
    ;;       mp's test-data.
    (tu.gen.jvm/with-random-cards mp 8
      (gt/iterate
       #_{:gentest.default-limit/seconds 5}
       {:gentest.default-limit/iterations 1}
       [base-query (lib/query mp (tu.rng/rand-nth (concat (lib.metadata/tables mp) &cards)))
        limit      (inc (tu.rng/rand-int lib.tu.gen/sane-iterations-limit))]
       (doseq [query (lib.tu.gen/random-queries-from base-query limit)]
         (gt/testing ["query" query]
           (let [mp     (lib.tu/mock-metadata-provider
                         mp
                         {:cards [{:id            1
                                   :dataset-query (lib.convert/->legacy-MBQL query)}]})
                 result (qp/process-query (lib/query mp (lib.metadata/card mp 1)))]
             (testing "Successful query execution"
               (is (= :completed
                      (:status result))))
             (testing "At least one column returned"
               (is (<= 1 (count (mt/cols result))))
               (is (every? valid-col? (mt/cols result)))))))))))
