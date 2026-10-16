(ns metabase-enterprise.sandbox.api.dataset-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query   {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}
                                                            metabase.test.data/native-query {:namespaces [metabase-enterprise.sandbox.api.dataset-test]}}}}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.permissions.core :as perms]
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

(deftest sandboxed-query-native-form-test
  (testing "POST /api/dataset doesn't return the sandboxed compiled query or its params to a sandboxed user"
    ;; sandbox defs are thunks so `mt/id` resolves against the DB copy `with-gtaps-for-user!` creates
    (doseq [[sandbox-type sandbox-thunk attributes secrets]
            [[:remapping
              (fn []
                {:remappings {"price" ["variable" [:field (mt/id :venues :price) nil]]}})
              {"price" "1"}
              []]
             [:card
              (fn []
                {:query      (mt/native-query
                              {:query         (str "SELECT * FROM VENUES WHERE NAME <> {{secret_attr}} "
                                                   "AND 'SANDBOX-SQL-MARKER' <> ''")
                               :template-tags {"secret_attr" {:name         "secret_attr"
                                                              :display-name "secret_attr"
                                                              :type         "text"
                                                              :required     true
                                                              :id           "11111111-1111-1111-1111-111111111111"}}})
                 :remappings {"secret_attr" ["variable" ["template-tag" "secret_attr"]]}})
              {"secret_attr" "SECRET-ATTRIBUTE-VALUE"}
              ["SANDBOX-SQL-MARKER" "SECRET-ATTRIBUTE-VALUE"]]]]
      (testing sandbox-type
        (met/with-gtaps-for-user! :rasta
          {:gtaps      {:venues (sandbox-thunk)}
           :attributes attributes}
          (let [response (mt/user-http-request :rasta :post 202 "dataset" (mt/mbql-query venues {:limit 1}))]
            (is (= "completed" (:status response)))
            (is (nil? (get-in response [:data :native_form])))
            (doseq [secret secrets]
              (is (not (str/includes? (pr-str response) secret))))))))))

(deftest sandboxed-user-native-query-test
  (testing "A user with an enforced sandbox on a database can't use native queries there, even when their group grants
           native query access, because native queries bypass the sandbox"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues {:filter [:= $category_id 50]})}}}
      (perms/set-database-permission! &group (mt/id) :perms/create-queries :query-builder-and-native)
      (testing "POST /api/dataset refuses ad-hoc native SQL"
        (is (=? {:status "failed"
                 :error  "You do not have permissions to run this query."}
                (mt/user-http-request :rasta :post "dataset"
                                      (mt/native-query {:query "SELECT COUNT(*) FROM VENUES"})))))
      (testing "POST /api/dataset/native refuses to compile a query to SQL"
        (is (=? {:required-permissions {(mt/id) {:perms/create-queries "query-builder-and-native"}}
                 :message              "You do not have permissions to run this query."}
                (mt/user-http-request :rasta :post "dataset/native" (mt/mbql-query venues)))))
      (testing "MBQL queries are still sandboxed"
        (is (= [[10]]
               (mt/rows (mt/user-http-request :rasta :post 202 "dataset"
                                              (mt/mbql-query venues {:aggregation [[:count]]}))))))
      (testing "native queries are allowed when another group grants unrestricted access to the sandboxed table"
        (mt/with-temp [:model/PermissionsGroup           {other-group-id :id} {}
                       :model/PermissionsGroupMembership _ {:group_id other-group-id
                                                            :user_id  (mt/user->id :rasta)}]
          (perms/set-database-permission! other-group-id (mt/id) :perms/view-data :unrestricted)
          (is (= [[100]]
                 (mt/rows (mt/user-http-request :rasta :post 202 "dataset"
                                                (mt/native-query {:query "SELECT COUNT(*) FROM VENUES"}))))))))))
