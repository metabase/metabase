(ns metabase.api.action-test
  (:require [clojure.test :refer :all]
            [metabase.actions.test-util :as actions.test-util]
            [metabase.api.action :as api.action]
            [metabase.models :refer [Card ModelAction]]
            [metabase.models.action :refer [Action]]
            [metabase.test :as mt]
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
  (actions.test-util/with-actions-enabled
    (mt/with-temp* [Card [{card-id :id} {:dataset true}]]
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
                             action))))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (actions.test-util/with-actions-enabled
      (actions.test-util/with-action [{:keys [action-id]} {}]
        (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
          (testing "Should return a query action deserialized (#23201)"
            (is (schema= ExpectedGetQueryActionAPIResponse
                         action))))))))

(deftest unified-action-create-test
  (actions.test-util/with-actions-enabled
    (mt/with-temp* [Card [{card-id :id} {:dataset true}]]
      (mt/with-model-cleanup [Action]
        (doseq [initial-action [{:name "Get example"
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
                                 :parameters [{:id "x" :type "number"}]}
                                {:name "Implicit example"
                                 :type "implicit"
                                 :model_id card-id
                                 :kind "row/create"
                                 :parameters [{:id "x" :type "number"}]}]]
          (let [created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
                updated-action (merge initial-action {:name "New name"})
                action-path (str "action/" (:id created-action))]
            (testing "Create"
              (is (partial= initial-action created-action)))
            (testing "Update"
              (is (partial= updated-action
                            (mt/user-http-request :crowberto :put 200 action-path
                                                  {:name "New name"}))))
            (testing "Get"
              (is (partial= updated-action
                            (mt/user-http-request :crowberto :get 200 action-path))))
            (testing "Get All"
              (is (partial= updated-action
                            (last (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))))
            (testing "Delete"
              (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
              (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path))))))))))

(deftest action-parameters-test
  (actions.test-util/with-actions-enabled
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
              action-path (str "action/" (:id created-action))]
          (testing "Validate POST"
            (testing "Required fields"
              (is (partial= {:errors {:name "value must be a string."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"})))
              (is (partial= {:errors {:model_id "value must be an integer greater than zero."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "test"}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :error_handle "x"))))))
          (testing "Validate PUT"
            (testing "Template needs method and url"
              (is (partial= {:errors {:template "value may be nil, or if non-nil, value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "http" :template {}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :error_handle "x")))))))))))
