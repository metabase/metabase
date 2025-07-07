(ns metabase.query-processor-test.field-ref-repro-test
  "Reproduction tests for field ref(erence) issues. These are negative tests, if some fail,
  we might have actually fixed a bug."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel native-query-model-remapped-column-join-test
  (testing "Should be able to join on remapped model column (#58314)"
    (mt/with-driver :h2
      (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
            card-data (-> {:dataset_query {:native   {:query "SELECT 1 AS _ID"}
                                           :database (mt/id)
                                           :type     :native}
                           :type :model}
                          mt/card-with-metadata
                          (update :result_metadata vec)
                          (update-in [:result_metadata 0]
                                     merge
                                     ;; simulate the FE setting the redirection metadata
                                     (-> (lib.metadata/field mp (mt/id :orders :id))
                                         (select-keys [:description :display-name
                                                       :id :semantic-type])
                                         (set/rename-keys {:display-name :display_name
                                                           :semantic-type :semantic_type}))))]
        (mt/with-temp [:model/Card card card-data]
          (let [card-meta (lib.metadata/card mp (:id card))
                base (lib/query mp card-meta)
                lhs (first (lib/join-condition-lhs-columns base card-meta nil nil))
                rhs (first (lib/join-condition-rhs-columns base card-meta nil nil))
                query (lib/join base (-> (lib/join-clause card-meta [(lib/= lhs (lib/with-join-alias rhs "j"))])
                                         (lib/with-join-fields :all)
                                         (lib/with-join-alias "j")))]
            (mt/with-native-query-testing-context query
              ;; should return a single row with two columns, but fails instead
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Column \"j\.ID\" not found"
                                    (mt/rows+column-names
                                     (qp/process-query query)))))))))))
