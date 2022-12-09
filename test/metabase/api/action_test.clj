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

(def ^:private ExpectedGetCardActionAPIResponse
  "Expected schema for a CardAction as it should appear in the response for an API request to one of the GET endpoints."
  {:id       su/IntGreaterThanOrEqualToZero
   :card     {:id            su/IntGreaterThanOrEqualToZero
              :dataset_query {:database su/IntGreaterThanOrEqualToZero
                              :type     (s/eq "native")
                              :native   {:query    s/Str
                                         s/Keyword s/Any}
                              s/Keyword s/Any}
              s/Keyword      s/Any}
   :parameters s/Any
   :visualization_settings su/Map
   s/Keyword s/Any})

(deftest list-actions-test
  (testing "GET /api/action"
    (actions.test-util/with-actions-enabled
      (actions.test-util/with-action [{:keys [action-id]} {}]
        (mt/with-temp* [Card [{card-id :id} {:dataset true :dataset_query (mt/mbql-query categories)}]
                        ModelAction [_ {:card_id card-id :slug "custom" :action_id action-id}]
                        ModelAction [_ {:card_id card-id :slug "insert"}]
                        ModelAction [_ {:card_id card-id :slug "update" :requires_pk true}]
                        ModelAction [_ {:card_id card-id :slug "delete" :requires_pk true}]]
          (let [response (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))]
            (is (partial= [{:slug "custom"
                            :action_id action-id
                            :parameters [{:id "id"} {:id "name"}]
                            :card {:is_write true}
                            :type "query"
                            :name "Query Example"}
                           {:slug "insert" :action_id nil :parameters [{:id "name"}] :type "implicit"}
                           {:slug "update" :action_id nil :parameters [{:id "id"} {:id "name"}] :type "implicit"}
                           {:slug "delete" :action_id nil :parameters [{:id "id"}] :type "implicit"}]
                          response))
            (let [action (some (fn [action]
                                 (when (= (:id action) action-id)
                                   action))
                               response)]
              (testing "Should return Card dataset_query deserialized (#23201)"
                (is (schema= ExpectedGetCardActionAPIResponse
                             action))))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (testing "Should return Card dataset_query deserialized (#23201)"
      (actions.test-util/with-actions-enabled
        (actions.test-util/with-action [{:keys [action-id]} {}]
          (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
            (testing "Should return Card dataset_query deserialized (#23201)"
              (is (schema= ExpectedGetCardActionAPIResponse
                           action)))))))))

(deftest action-crud-test
  (mt/with-model-cleanup [Action]
    (actions.test-util/with-actions-enabled
      (let [initial-action {:name "Get example"
                            :type "http"
                            :template {:method "GET"
                                       :url "https://example.com/{{x}}"
                                       :parameters [{:id "x" :type "text"}]}
                            :response_handle ".body"
                            :error_handle ".status >= 400"}
            created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
            updated-action (merge initial-action {:name "New name"})
            action-path (str "action/" (:id created-action))]
        (mt/with-temp* [Card [{card-id :id} {:dataset true}]
                        ModelAction [_ {:card_id card-id :action_id (:id created-action) :slug "action"}]]
          (testing "Create"
            (is (partial= initial-action created-action)))
          (testing "Validate POST"
            (testing "Required fields"
              (is (partial= {:errors {:type "Only http actions are supported at this time."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "query"})))
              (is (partial= {:errors {:name "value must be a string."}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"})))
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "test"}))))
            (testing "Template needs method and url"
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "Test" :template {}}))))
            (testing "Template parameters should be well formed"
              (is (partial= {:errors {:template "value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :post 400 "action" {:type "http"
                                                                                 :name "Test"
                                                                                 :template {:url "https://example.com"
                                                                                            :method "GET"
                                                                                            :parameters {}}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :error_handle "x"))))))
          (testing "Update"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :put 200 action-path
                                                {:name "New name" :type "http"}))))
          (testing "Get"
            (is (partial= updated-action
                          (mt/user-http-request :crowberto :get 200 action-path)))
            (is (partial= updated-action
                          (last (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))))
          (testing "Validate PUT"
            (testing "Can't create or change http type"
              (is (partial= {:errors {:type "Only http actions are supported at this time."}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "query"}))))
            (testing "Template needs method and url"
              (is (partial= {:errors {:template "value may be nil, or if non-nil, value must be a map with schema: (\n  body (optional) : value may be nil, or if non-nil, value must be a string.\n  headers (optional) : value may be nil, or if non-nil, value must be a string.\n  parameter_mappings (optional) : value may be nil, or if non-nil, value must be a map.\n  parameters (optional) : value may be nil, or if non-nil, value must be an array. Each value must be a map.\n  method : value must be one of: `DELETE`, `GET`, `PATCH`, `POST`, `PUT`.\n  url : value must be a string.\n)"}}
                            (mt/user-http-request :crowberto :put 400 action-path {:type "http" :template {}}))))
            (testing "Handles need to be valid jq"
              (is (partial= {:errors {:response_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :response_handle "body"))))
              (is (partial= {:errors {:error_handle "value may be nil, or if non-nil, must be a valid json-query"}}
                            (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :error_handle "x"))))))
          (testing "Delete"
            (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
            (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path)))))))))
