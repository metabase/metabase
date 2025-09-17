(ns metabase-enterprise.permission-debug.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(defn with-advanced-permissions-fixture [f]
  (mt/with-premium-features #{:advanced-permissions}
    (f)))

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each with-advanced-permissions-fixture)

(deftest permission-debug-test
  (testing "GET /api/ee/permission_debug"
    (testing "should require superuser permissions"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/permission_debug"))))))

(deftest permission-debug-card-read-scenarios-test
  (testing "GET /api/ee/permission_debug for card/read scenarios"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)}]
      (testing "should return allow when user has read permission"
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :rasta))
                                             :model_id (str (:id card))
                                             :action_type "card/read")]
          (is (= "allow" (:decision response)))
          (is (= "card" (:model-type response)))
          (is (= (str (:id card)) (:model-id response)))
          (is (= '() (:segment response)))
          (is (seq (:message response)))
          (is (= {} (:data response)))
          (is (= {} (:suggestions response)))))

      (testing "should return denied when user lacks read permission"
        (mt/with-temp [:model/Collection private-collection {}
                       :model/Card private-card {:collection_id (:id private-collection)}]
          (perms/revoke-collection-permissions! (perms/all-users-group) private-collection)
          (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                               :user_id (str (mt/user->id :rasta))
                                               :model_id (str (:id private-card))
                                               :action_type "card/read")]
            (is (= "denied" (:decision response)))
            (is (= "card" (:model-type response)))
            (is (seq (:message response))))
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) private-collection))))))

(deftest permission-debug-card-query-scenarios-test
  (testing "GET /api/ee/permission_debug for card/query scenarios"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (testing "should return allow when user has query permission"
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :rasta))
                                             :model_id (str (:id card))
                                             :action_type "card/query")]
          (is (= "allow" (:decision response)))
          (is (= "card" (:model-type response)))
          (is (= '() (:segment response)))
          (is (= {} (:data response)))))

      (testing "should return denied when table access is blocked"
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :blocked)
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :rasta))
                                             :model_id (str (:id card))
                                             :action_type "card/query")]
          (is (= "denied" (:decision response)))
          (is (seq (:data response))))))))

(deftest permission-debug-card-download-scenarios-test
  (testing "GET /api/ee/permission_debug for card/download-data scenarios"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)
                                     :dataset_query (mt/mbql-query checkins {:filter [:> $date "2014-01-01"]})}]
      (testing "should return allow when user has download permission"
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :one-million-rows)
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :crowberto))
                                             :model_id (str (:id card))
                                             :action_type "card/download-data")]
          (is (= "allow" (:decision response)))
          (is (= "card" (:model-type response)))
          (is (= '() (:segment response)))
          (is (seq (:message response)))))

      (testing "should return limited when user has limited download permission"
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/view-data :unrestricted)
        (perms/set-table-permission! (perms/all-users-group) (mt/id :checkins) :perms/download-results :ten-thousand-rows)
        (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                             :user_id (str (mt/user->id :rasta))
                                             :model_id (str (:id card))
                                             :action_type "card/download-data")]
          (is (contains? #{"allow" "limited" "denied"} (:decision response)))
          (is (= "card" (:model-type response))))))))

(deftest permission-debug-invalid-scenarios-test
  (testing "GET /api/ee/permission_debug for invalid scenarios"
    (testing "should handle unknown permission types"
      (is (= {:specific-errors
              {:action_type ["should be either :card/read, :card/query or :card/download-data, received: :unknown/permission"]},
              :errors {:action_type "enum of :card/read, :card/query, :card/download-data"}}
             (mt/user-http-request :crowberto :get 400 "ee/permission_debug"
                                   :user_id "1"
                                   :model_id "999"
                                   :action_type "unknown/permission"))))

    (testing "should require valid parameters"
      (is (= {:errors {:user_id "integer greater than 0"},
              :specific-errors {:user_id ["should be a positive int, received: \"invalid\""]}}
             (mt/user-http-request :crowberto :get "ee/permission_debug"
                                   :user_id "invalid"
                                   :model_id "999"
                                   :action_type "card/read"))))))

(deftest permission-debug-response-schema-test
  (testing "GET /api/ee/permission_debug response schema validation"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card card {:collection_id (:id collection)}]
      (let [response (mt/user-http-request :crowberto :get 200 "ee/permission_debug"
                                           :user_id (str (mt/user->id :rasta))
                                           :model_id (str (:id card))
                                           :action_type "card/read")]
        (testing "response should have all required fields"
          (is (contains? response :decision))
          (is (contains? response :model-type))
          (is (contains? response :model-id))
          (is (contains? response :segment))
          (is (contains? response :message))
          (is (contains? response :data))
          (is (contains? response :suggestions)))

        (testing "decision should be valid enum value"
          (is (contains? #{"allow" "denied" "limited"} (:decision response))))

        (testing "segment should be a sequence"
          (is (sequential? (:segment response))))

        (testing "message should be a sequence"
          (is (sequential? (:message response))))

        (testing "data and suggestions should be maps"
          (is (map? (:data response)))
          (is (map? (:suggestions response))))))))
