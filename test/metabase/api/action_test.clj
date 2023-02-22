(ns metabase.api.action-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.action :as api.action]
   [metabase.models :refer [Action Card Database]]
   [metabase.models.user :as user]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

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
   :public_uuid            (s/maybe su/UUIDString)
   :made_public_by_id      (s/maybe su/IntGreaterThanOrEqualToZero)
   :creator_id             su/IntGreaterThanZero
   :creator                user/DefaultUser
   s/Keyword               s/Any})

(deftest list-actions-test
  (mt/with-actions-enabled
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-actions-test-data-tables #{"users"}
        (mt/with-actions [{card-id :id} {:dataset true :dataset_query (mt/mbql-query users)}
                          action-1 {:name              "Get example"
                                    :type              :http
                                    :model_id          card-id
                                    :template          {:method "GET"
                                                        :url "https://example.com/{{x}}"}
                                    :parameters        [{:id "x" :type "text"}]
                                    :public_uuid       (str (UUID/randomUUID))
                                    :made_public_by_id (mt/user->id :crowberto)
                                    :response_handle   ".body"
                                    :error_handle      ".status >= 400"}
                          action-2 {:name                   "Query example"
                                    :type                   :query
                                    :model_id               card-id
                                    :dataset_query          (update (mt/native-query {:query "update venues set name = 'foo' where id = {{x}}"})
                                                                    :type name)
                                    :database_id            (mt/id)
                                    :parameters             [{:id "x" :type "number"}]
                                    :visualization_settings {:position "top"}}
                          action-3 {:name       "Implicit example"
                                    :type       :implicit
                                    :model_id   card-id
                                    :kind       "row/create"
                                    :parameters [{:id "x" :type "number"}]}
                          _archived {:name                   "Archived example"
                                     :type                   :query
                                     :model_id               card-id
                                     :dataset_query          (update (mt/native-query {:query "update venues set name = 'foo' where id = {{x}}"})
                                                                     :type name)
                                     :database_id            (mt/id)
                                     :parameters             [{:id "x" :type "number"}]
                                     :visualization_settings {:position "top"}
                                     :archived               true}]
          (let [response (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))]
            (is (= (map :action-id [action-1 action-2 action-3])
                   (map :id response)))
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
                                                {:dataset false})))))))))

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
            (let [update-fn      (fn [m]
                                   (cond-> (assoc m :name "New name")
                                     (= (:type initial-action) "implicit")
                                     (assoc :kind "row/update" :description "A new description")

                                     (= (:type initial-action) "query")
                                     (assoc :dataset_query (update (mt/native-query {:query "update users set name = 'bar' where id = {{x}}"})
                                                                   :type name))

                                     (= (:type initial-action) "http")
                                     (-> (assoc :response_handle ".body.result"  :description nil))))
                  expected-fn    (fn [m]
                                   (cond-> m
                                     (= (:type initial-action) "implicit")
                                     (assoc :parameters [{:id "id" :type "type/BigInteger" :special "hello"}])))
                  updated-action (update-fn initial-action)]
              (testing "Create fails with"
                (testing "no permission"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :post 403 "action" initial-action))))
                (testing "actions disabled"
                  (mt/with-actions-disabled
                    (is (= "Actions are not enabled."
                           (:cause
                            (mt/user-http-request :crowberto :post 400 "action" initial-action))))))
                (testing "a plain card instead of a model"
                  (mt/with-temp Card [{plain-card-id :id}]
                    (is (= "Actions must be made with models, not cards."
                           (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :model_id plain-card-id)))))))
              (let [created-action (mt/user-http-request :crowberto :post 200 "action" initial-action)
                    action-path    (str "action/" (:id created-action))]
                (testing "Create"
                  (testing "works with acceptable params"
                    (is (partial= (expected-fn initial-action) created-action))))
                (testing "Update"
                  (is (partial= (expected-fn updated-action)
                                (mt/user-http-request :crowberto :put 200 action-path (update-fn {}))))
                  (testing "Update fails with"
                    (testing "no permission"
                      (is (= "You don't have permissions to do that."
                             (mt/user-http-request :rasta :put 403 action-path (update-fn {})))))
                    (testing "actions disabled"
                      (mt/with-actions-disabled
                        (is (= "Actions are not enabled."
                               (:cause
                                (mt/user-http-request :crowberto :put 400 action-path (update-fn {}))))))))
                  (testing "Get"
                    (is (partial= (expected-fn updated-action)
                                  (mt/user-http-request :crowberto :get 200 action-path)))
                    (testing "Should not be possible without permission"
                      (is (= "You don't have permissions to do that."
                             (mt/user-http-request :rasta :get 403 action-path))))
                    (testing "Should still work if actions are disabled"
                      (mt/with-actions-disabled
                        (is (partial= (expected-fn updated-action)
                                      (mt/user-http-request :crowberto :get 200 action-path))))))
                  (testing "Get All"
                    (is (partial= [{:id exiting-implicit-action-id, :type "implicit", :kind "row/update"}
                                   (expected-fn updated-action)]
                                  (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))
                    (testing "Should not be possible without permission"
                      (is (= "You don't have permissions to do that."
                             (mt/user-http-request :rasta :get 403 (str "action?model-id=" card-id)))))
                    (testing "Should still work if actions are disabled"
                      (mt/with-actions-disabled
                        (is (partial= [{:id exiting-implicit-action-id, :type "implicit", :kind "row/update"}
                                       (expected-fn updated-action)]
                                      (mt/user-http-request :crowberto :get 200 (str "action?model-id=" card-id))))))))
                (testing "Delete"
                  (testing "Should not be possible without permission"
                    (is (= "You don't have permissions to do that."
                           (mt/user-http-request :rasta :delete 403 action-path))))
                  (is (nil? (mt/user-http-request :crowberto :delete 204 action-path)))
                  (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path))))))))))))

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
              action-id      (u/the-id created-action)
              action-path    (str "action/" action-id)]
          (testing "Archiving"
            (mt/user-http-request :crowberto :put 200 action-path {:archived true})
            (is (true? (db/select-one-field :archived Action :id action-id)))
            (mt/user-http-request :crowberto :put 200 action-path {:archived false})
            (is (false? (db/select-one-field :archived Action :id action-id))))
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
                              "nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys"},
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

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private unshared-action-opts
  {:public_uuid       nil
   :made_public_by_id nil})

(defn- shared-action-opts []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (mt/user->id :crowberto)})

(deftest fetch-public-actions-test
  (testing "GET /api/action/public"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (let [action-opts (assoc (shared-action-opts) :name "Test action")]
        (mt/with-actions [{:keys [action-id model-id]} action-opts]
          (testing "Test that it requires superuser"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "action/public"))))
          (testing "Test that superusers can fetch a list of publicly-accessible actions"
            (is (= [{:name "Test action" :id action-id :public_uuid (:public_uuid action-opts) :model_id model-id}]
                   (filter #(= (:id %) action-id) (mt/user-http-request :crowberto :get 200 "action/public"))))))
        (testing "We cannot fetch an archived action"
          (mt/with-actions [{} (assoc action-opts :archived true)]
            (is (= []
                   (mt/user-http-request :crowberto :get 200 "action/public")))))))))

(deftest share-action-test
  (testing "POST /api/action/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-actions-enabled
        (mt/with-non-admin-groups-no-root-collection-perms
          (testing "We can share an action"
            (mt/with-actions [{:keys [action-id]} unshared-action-opts]
              (let [uuid (:uuid (mt/user-http-request :crowberto :post 200
                                                      (format "action/%d/public_link" action-id)))]
                (is (db/exists? Action :id action-id, :public_uuid uuid))
                (testing "Test that if an Action has already been shared we reuse the existing UUID"
                  (is (= uuid
                         (:uuid (mt/user-http-request :crowberto :post 200
                                                      (format "action/%d/public_link" action-id)))))))))

          (testing "We cannot share an archived action"
            (mt/with-actions [{:keys [action-id]} (assoc unshared-action-opts :archived true)]
              (is (= "Not found."
                     (mt/user-http-request :crowberto :post 404
                                           (format "action/%d/public_link" action-id))))))
          (mt/with-actions [{:keys [action-id]} {}]
            (testing "We *cannot* share a Action if the setting is disabled"
              (mt/with-temporary-setting-values [enable-public-sharing false]
                (is (= "Public sharing is not enabled."
                       (mt/user-http-request :crowberto :post 400 (format "action/%d/public_link" action-id))))))

            (testing "We *cannot* share an action if actions are disabled"
              (mt/with-actions-disabled
                (is (= "Actions are not enabled."
                       (:cause
                        (mt/user-http-request :crowberto :post 400 (format "action/%d/public_link" action-id)))))))

            (testing "We get a 404 if the Action doesn't exist"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :post 404 (format "action/%d/public_link" Integer/MAX_VALUE)))))))

        (testing "We *cannot* share an action if we aren't admins"
          (mt/with-actions [{:keys [action-id]} unshared-action-opts]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 (format "action/%d/public_link" action-id))))))))))

(deftest disable-sharing-action-test
  (testing "DELETE /api/action/:id/public_link"
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (mt/with-actions-enabled
        (let [action-opts (shared-action-opts)]
          (mt/with-actions [{:keys [action-id]} action-opts]
            (testing "We *cannot* unshare an action if actions are disabled"
              (mt/with-actions-disabled
                (is (= "Actions are not enabled."
                       (:cause
                        (mt/user-http-request :crowberto :delete 400 (format "action/%d/public_link" action-id)))))))
            (testing "Test that we can unshare an action"
              (mt/user-http-request :crowberto :delete 204 (format "action/%d/public_link" action-id))
              (is (= false
                     (db/exists? Action :id action-id, :public_uuid (:public_uuid action-opts)))))))

        (testing "Test that we cannot unshare an action if it's archived"
          (let [action-opts (merge {:archived true} (shared-action-opts))]
            (mt/with-actions [{:keys [action-id]} action-opts]
              (is (= "Not found."
                     (mt/user-http-request :crowberto :delete 404 (format "action/%d/public_link" action-id)))))))


        (testing "Test that we *cannot* unshare a action if we are not admins"
          (let [action-opts (shared-action-opts)]
            (mt/with-actions [{:keys [action-id]} action-opts]
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :delete 403 (format "action/%d/public_link" action-id)))))))

        (testing "Test that we get a 404 if Action isn't shared"
          (mt/with-actions [{:keys [action-id]} unshared-action-opts]
            (is (= "Not found."
                   (mt/user-http-request :crowberto :delete 404 (format "action/%d/public_link" action-id))))))

        (testing "Test that we get a 404 if Action doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :delete 404 (format "action/%d/public_link" Integer/MAX_VALUE)))))))))

(deftest execute-action-test
  (mt/with-actions-test-data-and-actions-enabled
    (mt/with-actions [{:keys [action-id]} unshared-action-opts]
      (testing "Action execution"
        (is (=? {:rows-affected 1}
                (mt/user-http-request :crowberto
                                      :post 200
                                      (format "action/%s/execute" action-id)
                                      {:parameters {:id 1 :name "European"}})))))
    (mt/with-actions [{:keys [action-id]} (assoc unshared-action-opts :archived true)]
      (testing "Check that we get a 404 if the action is archived"
        (is (= "Not found."
               (mt/user-http-request :crowberto
                                     :post 404
                                     (format "action/%s/execute" action-id)
                                     {:parameters {:id 1 :name "European"}})))))
    (mt/with-actions [{:keys [action-id]} unshared-action-opts]
      (let [nonexistent-id (inc (db/select-one-id Action {:order-by [[:id :desc]]}))]
        (testing "Check that we get a 404 if the action doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :crowberto
                                       :post 404
                                       (format "action/%s/execute" nonexistent-id)
                                       {:parameters {:id 1 :name "European"}})))))
      (testing "Check that we get a 400 if actions are disabled for the database."
        (mt/with-temp-vals-in-db Database (mt/id) {:settings {:database-enable-actions false}}
          (is (= "Actions are not enabled."
                 (:cause
                  (mt/user-http-request :crowberto
                                        :post 400
                                        (format "action/%s/execute" action-id)
                                        {:parameters {:id 1 :name "European"}})))))))))
