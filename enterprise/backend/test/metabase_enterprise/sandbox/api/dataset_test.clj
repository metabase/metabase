(ns metabase-enterprise.sandbox.api.dataset-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query   {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}
                                                            metabase.test.data/native-query {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]))

(deftest dataset-parameter-test
  (testing "POST /api/dataset/parameter/values should respect sandboxing"
    (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:<= $id 3]})}}}
      (testing "with values_source_type=card"
        (mt/with-temp
          [:model/Card {source-card-id :id} {:database_id   (mt/id)
                                             :table_id      (mt/id :categories)
                                             :dataset_query (mt/mbql-query categories)}]
          (testing "when getting values"
            (let [get-values (fn [user]
                               (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                     {:parameter {:id                   "abc"
                                                                  :type                 "category"
                                                                  :name                 "CATEGORY"
                                                                  :values_source_type   "card"
                                                                  :values_source_config {:card_id     source-card-id
                                                                                         :value_field (mt/$ids $categories.name)}}}))]
              ;; returns much more if not sandboxed
              (is (> (-> (get-values :crowberto) :values count) 3))
              (is (=? {:values          [["African"] ["American"] ["Artisan"]]
                       :has_more_values false}
                      (get-values :rasta)))))
          (testing "when searching values"
            (let [search (fn [user]
                           (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                                 {:parameter {:id                   "abc"
                                                              :type                 "category"
                                                              :name                 "CATEGORY"
                                                              :values_source_type   "card"
                                                              :values_source_config {:card_id     source-card-id
                                                                                     :value_field (mt/$ids $categories.name)}}}))]
              ;; returns `BBQ` if not sandboxed
              (is (=? {:values          [["BBQ"]]
                       :has_more_values false}
                      (search :crowberto)))
              (is (=? {:values          []
                       :has_more_values false}
                      (search :rasta)))))))
      (testing "values_source_type=nil (values from fields)"
        (testing "when getting values"
          (let [get-values (fn [user]
                             (mt/user-http-request user :post 200 "/dataset/parameter/values"
                                                   {:parameter {:id                 "abc"
                                                                :type               "category"
                                                                :name               "CATEGORY"
                                                                :values_source_type nil}
                                                    :field_ids [(mt/id :categories :name)]}))]
            ;; returns much more if not sandboxed
            (is (> (-> (get-values :crowberto) :values count) 3))
            (is (=? {:values          [["Artisan"] ["African"] ["American"]]
                     :has_more_values false}
                    (get-values :rasta)))))
        (testing "when searching values"
          (let [search (fn [user]
                         (mt/user-http-request user :post 200 "/dataset/parameter/search/BBQ"
                                               {:parameter {:id                 "abc"
                                                            :type               "category"
                                                            :name               "CATEGORY"
                                                            :values_source_type nil}
                                                :field_ids [(mt/id :categories :name)]}))]
            ;; returns `BBQ` if not sandboxed
            (is (=? {:values [["BBQ"]]}
                    (search :crowberto)))
            (is (=? {:values          []}
                    (search :rasta)))))))))

(deftest failed-sandboxed-query-error-test
  (testing "POST /api/dataset doesn't return the sandbox Card's SQL or the user's attribute values when the query fails"
    (met/with-gtaps-for-user! :rasta
      {:gtaps      {:venues {:query      (mt/native-query
                                          {:query         (str "SELECT * FROM VENUES WHERE NAME <> {{secret_attr}} "
                                                               "AND 'SANDBOX-SQL-MARKER' <> ''")
                                           :template-tags {"secret_attr" {:name         "secret_attr"
                                                                          :display-name "secret_attr"
                                                                          :type         "text"
                                                                          :required     true
                                                                          :id           "11111111-1111-1111-1111-111111111111"}}})
                             :remappings {"secret_attr" ["variable" ["template-tag" "secret_attr"]]}}}
       :attributes {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}}
      ;; truncating an integer to a month fails in the warehouse, after the sandbox has been compiled into the SQL
      (let [response (mt/user-http-request :rasta :post 400 "dataset" (mt/mbql-query venues {:fields [!month.id]}))]
        (is (= "failed" (:status response)))
        (is (= "invalid-query" (:error_type response)))
        ;; H2 echoes the failing statement in its own error message, so leave the messages out of this check
        (let [without-messages (-> response
                                   (dissoc :error)
                                   (update :via (partial mapv #(dissoc % :error))))]
          (doseq [secret ["SANDBOX-SQL-MARKER" "SECRET-ATTRIBUTE-VALUE"]]
            (testing secret
              (is (not (str/includes? (pr-str without-messages) secret))))))))))
