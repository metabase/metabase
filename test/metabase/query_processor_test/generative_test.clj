(ns metabase.query-processor-test.generative-test
  "Query processor generative tests."
  (:require
   [clojure.pprint :as pprint]
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
   [metabase.test.util.generators.jvm :as tu.gen.jvm]
   [metabase.test.util.random :as tu.rng]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(comment
  (alter-var-root #_:clj-kondo/ignore #'environ.core/env assoc
                  :mb-gentest-run "true"
                  )
  
  #_:clj-kondo/ignore
  (select-keys environ.core/env (filter #(re-find #"mb-gentest" (name %))
                                        (keys environ.core/env)))
  )

;; into card test
(deftest query-execution-test
  (when (config/config-bool :mb-gentest-run)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      ;; TODO: 1. Limit override for repl
      (gentest/with-gentest
        {:gentest.default-limit/seconds 5}
        #_{:gentest.default-limit/iterations 1}
        [base-query (lib/query mp (tu.rng/rand-nth (lib.metadata/tables mp)))
         limit (inc (tu.rng/rand-int 20))]
        (doseq [query (lib.tu.gen/random-queries-from base-query limit)]
          (mt/with-temp
            [:model/Card
             {id :id}
             {:dataset_query (lib.convert/->legacy-MBQL query)}]
            (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
              (testing "Successful query execution"
                ;; TODO: Adjust kondo for pprint with with-out-str, create is that does not eval message
                ;; or alternative reporting.
                (or (is (= :completed
                           (:status result)))
                    (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                 :result result})))))
              (testing "At least one column returned"
                (or (is (<= 1 (count (mt/cols result))))
                    (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                 :result result}))))
                (or (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))
                    (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                 :result result}))))))))))))

(deftest query-execution-with-cards-test
  (when (config/config-bool :mb-gentest-run)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (gentest/with-gentest
        {:gentest.default-limit/iterations 1}
        []
        (tu.gen.jvm/with-random-cards mp 6
          (let [query (lib.tu.gen/random-query mp)
                result (qp/process-query (lib/query mp query))]
            (testing "Successful query execution"
              (or (is (= :completed
                         (:status result)))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result})))))
            (testing "At least one column returned"
              (or (is (<= 1 (count (mt/cols result))))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result}))))
              (or (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result})))))))))))

(deftest query-execution-with-cards-WITH-CONTEXT-test
  (when (config/config-bool :mb-gentest-run)
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (gentest/with-gentest
        {:gentest.default-limit/iterations 1}
        []
        (tu.gen.jvm/with-random-cards mp 6
          (let [query (lib.tu.gen/random-query mp)
                result (qp/process-query (lib/query mp query))]
            (testing "Successful query execution"
              (or (is (= :completed
                         (:status result)))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result})))))
            (testing "At least one column returned"
              (or (is (<= 1 (count (mt/cols result))))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result}))))
              (or (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))
                  (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                               :result result})))))))))))

(comment
  
  (alter-var-root #'environ.core/env assoc
                  :mb-gentest-seed "9131285353844560210")

  (def ccc nil)
  )

(gentest/defgentest qwer-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
    (def ccon metabase.test.gentest/*context*)
    (tu.gen.jvm/with-random-cards mp 6
      (gentest/iterate
       {:gentest.default-limit/iterations 1}
       [base-query (lib/query mp @(def aa (tu.rng/rand-nth (concat (lib.metadata/tables mp) &cards))))
        limit (inc (tu.rng/rand-int lib.tu.gen/sane-iterations-limit))]
       (doseq [query (lib.tu.gen/random-queries-from base-query limit)]
         (def qq query)
         (mt/with-temp
           [:model/Card
            {id :id}
            {:dataset_query (lib.convert/->legacy-MBQL query)}]
           (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
             (testing "Successful query execution"
               (or (is (= :completed
                          (:status result)))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result})))))
             (testing "At least one column returned"
               (or (is (<= 1 (count (mt/cols result))))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result}))))
               (or (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result}))))))))))))

(comment
  
  (clojure.walk/macroexpand-all '(tu.gen.jvm/with-random-cards mp 2
                                   (def ccc &cards))
                                #_(gentest/defgentest cards-and-context-test
                                    (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
                                      )))
  
  (tu.gen.jvm/with-random-cards (metabase.lib.metadata.jvm/application-database-metadata-provider (mt/id)) 2
    &cards)
  
  
  )

(gentest/defgentest maxi-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
    (tu.gen.jvm/with-random-cards mp 6
      (def ccc &cards))))

(gentest/defgentest minisasdf-testisx-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
    (def ccon metabase.test.gentest/*context*)
    (tu.gen.jvm/with-random-cards mp 6
      (gentest/iterate
       {:gentest.default-limit/iterations 1}
       [base-query (lib/query mp @(def aa (tu.rng/rand-nth (concat (lib.metadata/tables mp) &cards))))
        limit (inc (tu.rng/rand-int lib.tu.gen/sane-iterations-limit))]
       #_(doseq [query (lib.tu.gen/random-queries-from base-query limit)]
         (def qq query)
         (mt/with-temp
           [:model/Card
            {id :id}
            {:dataset_query (lib.convert/->legacy-MBQL query)}]
           (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
             (testing "Successful query execution"
               (or (is (= :completed
                          (:status result)))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result})))))
             (testing "At least one column returned"
               (or (is (<= 1 (count (mt/cols result))))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result}))))
               (or (is (true? (apply (every-pred :name :base_type :display_name) (mt/cols result))))
                   (log/error (with-out-str #_:clj-kondo/ignore (pprint/pprint {:query query
                                                                                :result result}))))))))))))

(comment
  (alter-var-root #'environ.core/env assoc
                  :mb-gentest-context-seed "9131285353844560210"
                  :mb-gentest-iteration-seed "1")
  (alter-var-root #'environ.core/env dissoc :mb-gentest-iteration-seed)
  )

(gentest/defgentest minisasdf-testisx-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
    (tu.gen.jvm/with-random-cards mp 3
      (gentest/spit-context! :context/cards &cards)
      (gentest/iterate
       {:gentest.default-limit/iterations 1}
       [base-query (lib/query mp (tu.rng/rand-nth (concat #_(lib.metadata/tables mp)
                                                          &cards)))
        limit      1 #_(inc (tu.rng/rand-int lib.tu.gen/sane-iterations-limit))]
       (doseq [query (lib.tu.gen/random-queries-from base-query limit)]
         (gentest/spit-context! :execution/qut query)
         (mt/with-temp
           [:model/Card
            {id :id}
            {:dataset_query (lib.convert/->legacy-MBQL query)}]
           (let [result (qp/process-query (lib/query mp (lib.metadata/card mp id)))]
             (gentest/spit-context! :execution/result result)
             (testing "Successful query execution"
               (is (= 1 #_:completed
                      (:status result))))
             (testing "At least one column returned"
               (is (<= 1 (count (mt/cols result))))
               (is (true? (apply (every-pred :name :base_type :display_name)
                                 (mt/cols result))))))))))))