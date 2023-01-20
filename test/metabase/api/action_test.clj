(ns metabase.api.action-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.action :as api.action]
   [metabase.models :refer [Card]]
   [metabase.models.action :refer [Action]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]))

(comment api.action/keep-me)

(def ^:private ExpectedGetQueryActionAPIResponse
  "Expected schema for a query action as it should appear in the response for an API request to one of the GET endpoints."
  {:id                     su/IntGreaterThanOrEqualToZero
   :type                   (s/eq "query")
   :model_id               su/IntGreaterThanOrEqualToZero
   :database_id            su/IntGreaterThanOrEqualToZero
   :dataset_query          {:database su/IntGreaterThanOrEqualToZero
                            :type     (s/eq "native")
                            :native   {:query    s/Str
                                       s/Keyword s/Any}
                            s/Keyword s/Any}
   :parameters             s/Any
   :parameter_mappings     s/Any
   :visualization_settings su/Map
   s/Keyword               s/Any})

(deftest list-actions-test
  (mt/with-actions-enabled
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp Card [{card-id :id} {:dataset true}]
        (mt/with-model-cleanup [Action]
          (let [posted-actions [{:name "Get example"
                                 :type "http"
                                 :model_id card-id
                                 :template {:method "GET"
                                            :url "https://example.com/{{x}}"}
                                 :parameters [{:id "x" :type "text"}]
                                 :response_handle ".body"
                                 :error_handle ".status >= 400"}
                                {:name "Query example"
                                 :type "query"
                                 :model_id card-id
                                 :dataset_query (update (mt/native-query {:query "update venues set name = 'foo' where id = {{x}}"})
                                                        :type name)
                                 :database_id (mt/id)
                                 :parameters [{:id "x" :type "number"}]
                                 :visualization_settings {:position "top"}}
                                {:name "Implicit example"
                                 :type "implicit"
                                 :model_id card-id
                                 :kind "row/create"
                                 :parameters [{:id "x" :type "number"}]}]]
            (doseq [initial-action posted-actions]
              (mt/user-http-request :crowberto :post 200 "action" initial-action))
            (let [response (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))]
              (is (partial= posted-actions
                            response))
              (doseq [action response
                      :when (= (:type action) "query")]
                (testing "Should return a query action deserialized (#23201)"
                  (is (schema= ExpectedGetQueryActionAPIResponse
                               action)))))
            (testing "Should not be allowed to list actions without permission on the model"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (str "action?model-id=" card-id)))
                  "Should not be able to list actions without read permission on the model"))
            (testing "Should not be possible to demote a model with actions"
              (is (partial= {:message "Cannot make a question from a model with actions"}
                            (mt/user-http-request :crowberto :put 500 (str "card/" card-id)
                                                  {:dataset false}))))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (mt/with-actions-enabled
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-actions [{:keys [action-id]} {}]
          (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
            (testing "Should return a query action deserialized (#23201)"
              (is (schema= ExpectedGetQueryActionAPIResponse
                           action))))
          (testing "Should not be allowed to get the action without permission on the model"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "action/%d" action-id))))))))))

(deftest unified-action-create-test
  (mt/with-actions-enabled
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-actions-test-data-tables #{"users" "categories"}
        (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query users)}
                          {exiting-implicit-action-id :action-id} {:type :implicit :kind "row/update"}]
          (doseq [initial-action [{:name "Get example"
                                   :description "A dummy HTTP action"
                                   :type "http"
                                   :model_id card-id
                                   :template {:method "GET"
                                              :url "https://example.com/{{x}}"}
                                   :parameters [{:id "x" :type "text"}]
                                   :response_handle ".body"
                                   :error_handle ".status >= 400"}
                                  {:name "Query example"
                                   :description "A simple update query action"
                                   :type "query"
                                   :model_id card-id
                                   :dataset_query (update (mt/native-query {:query "update users set name = 'foo' where id = {{x}}"})
                                                          :type name)
                                   :database_id (mt/id)
                                   :parameters [{:id "x" :type "type/biginteger"}]}
                                  {:name "Implicit example"
                                   :type "implicit"
                                   :model_id card-id
                                   :kind "row/create"
                                   :parameters [{:id "nonexistent" :special "shouldbeignored"} {:id "id" :special "hello"}]}]]
            (let [update-fn (fn [m]
                              (cond-> (assoc m :name "New name")
                                (= (:type initial-action) "implicit")
                                (assoc :kind "row/update" :description "A new description")

                                (= (:type initial-action) "query")
                                (assoc :dataset_query (update (mt/native-query {:query "update users set name = 'bar' where id = {{x}}"})
                                                              :type name))

                                (= (:type initial-action) "http")
                                (-> (assoc :response_handle ".body.result"  :description nil))))
                  expected-fn (fn [m]
                                (cond-> m
                                  (= (:type initial-action) "implicit")
                                  (assoc :parameters [{:id "id" :type "type/BigInteger" :special "hello"}])))
                  created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
                  updated-action (update-fn initial-action)
                  action-path (str "action/" (:id created-action))]
              (testing "Create"
                (is (partial= (expected-fn initial-action) created-action))
                (testing "Should not be possible without permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :post 403 "action" initial-action)))))
              (testing "Update"
                (is (partial= (expected-fn updated-action)
                              (mt/user-http-request :crowberto :put 200 action-path (update-fn {}))))
                (testing "Should not be possible without permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :put 403 action-path (update-fn {}))))))
              (testing "Get"
                (is (partial= (expected-fn updated-action)
                              (mt/user-http-request :crowberto :get 200 action-path)))
                (testing "Should not be possible without permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :get 403 action-path)))))
              (testing "Get All"
                (is (partial= [{:id exiting-implicit-action-id, :type "implicit", :kind "row/update"}
                               (expected-fn updated-action)]
                              (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))
                (testing "Should not be possible without permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :get 403 (str "action?model-id=" card-id))))))
              (testing "Delete"
                (testing "Should not be possible without permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :delete 403 action-path))))
                (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
                (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path)))))))))))

(deftest action-parameters-test
  (mt/with-actions-enabled
    (mt/with-temp* [Card [{card-id :id} {:dataset true}]]
      (mt/with-model-cleanup [Action]
        (let [initial-action {:name "Get example"
                              :type "http"
                              :model_id card-id
                              :template {:method "GET"
                                         :url "https://example.com/{{x}}"
                                         :parameters [{:id "x" :type "text"}]}
                              :response_handle ".body"
                              :error_handle ".status >= 400"}
              created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
              action-path (str "action/" (u/the-id created-action))]
          (testing "Validate POST"
            (testing "Required fields"
              (is (partial= {:errors {:name "string"},
                             :specific-errors {:name ["should be a string"]}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"})))
              (is (partial= {:errors {:model_id "integer greater than 0"},
                             :specific-errors {:model_id ["should be a positive int"]}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "test"}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                             :specific-errors {:response_handle ["must be a valid json-query, something like '.item.title'"]}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                             :specific-errors {:error_handle ["must be a valid json-query, something like '.item.title'"]}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :error_handle "x"))))))
          (testing "Validate PUT"
            (testing "Template needs method and url"
              (is (partial= {:errors
                             {:template
                              "nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length <= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys"},
                             :specific-errors {:template {:method ["missing required key"],
                                                          :url ["missing required key"]}}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "http" :template {}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                             :specific-errors {:response_handle ["must be a valid json-query, something like '.item.title'"]}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                             :specific-errors {:error_handle ["must be a valid json-query, something like '.item.title'"]}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :error_handle "x")))))))))))
