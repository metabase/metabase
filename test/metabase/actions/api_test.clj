(ns ^:mb/driver-tests metabase.actions.api-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.actions.api :as api.action]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.collections.models.collection :as collection]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :db :web-server))

(comment api.action/keep-me)

(def ^:private DefaultUser
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:email        ms/NonBlankString]
   [:first_name   ms/NonBlankString]
   [:last_name    ms/NonBlankString]
   [:common_name  ms/NonBlankString]
   [:last_login   :any]
   [:date_joined  :any]
   [:is_qbnewb    :boolean]
   [:is_superuser :boolean]
   [:tenant_id    [:maybe ms/PositiveInt]]])

(def ^:private ExpectedGetQueryActionAPIResponse
  "Expected schema for a query action as it should appear in the response for an API request to one of the GET endpoints."
  [:map
   [:id                     ms/PositiveInt]
   [:type                   [:= "query"]]
   [:model_id               ms/PositiveInt]
   [:database_id            ms/PositiveInt]
   [:dataset_query          [:map
                             [:database ms/PositiveInt]
                             [:type     [:= "native"]]
                             [:native   [:map
                                         [:query :string]]]]]
   [:parameters             :any]
   [:parameter_mappings     :any]
   [:visualization_settings :map]
   [:public_uuid            [:maybe ms/UUIDString]]
   [:made_public_by_id      [:maybe ms/PositiveInt]]
   [:creator_id             ms/PositiveInt]
   [:creator                DefaultUser]])

(defn all-actions-default
  [card-id]
  [{:name            "Get example"
    :description     "A dummy HTTP action"
    :type            "http"
    :model_id        card-id
    :template        {:method "GET"
                      :url    "https://example.com/{{x}}"}
    :parameters      [{:id "x" :type "text"}]
    :response_handle ".body"
    :error_handle    ".status >= 400"}
   {:name          "Query example"
    :description   "A simple update query action"
    :type          "query"
    :model_id      card-id
    :dataset_query (update (mt/native-query {:query "update users set name = 'foo' where id = {{x}}"})
                           :type name)
    :database_id   (t2/select-one-fn :database_id :model/Card :id card-id)
    :parameters    [{:id "x" :type "type/biginteger"}]}
   {:name       "Implicit example"
    :type       "implicit"
    :model_id   card-id
    :kind       "row/create"
    :parameters [{:id "nonexistent" :special "shouldbeignored"} {:id "id" :special "hello"}]}])

(deftest list-actions-test
  (search/reset-tracking!)
  (mt/with-actions-enabled
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-actions-test-data-tables #{"users"}
        (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query users)}
                          action-1 {:name              "Get example"
                                    :type              :http
                                    :model_id          card-id
                                    :template          {:method "GET"
                                                        :url "https://example.com/{{x}}"}
                                    :parameters        [{:id "x" :type "text"}]
                                    :public_uuid       (str (random-uuid))
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
                          archived {:name                   "Archived example"
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
                (is (malli= ExpectedGetQueryActionAPIResponse
                            action)))))
          (testing "Should not be allowed to list actions without permission on the model"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (str "action?model-id=" card-id)))
                "Should not be able to list actions without read permission on the model"))
          (testing "Can list all actions"
            (let [response (mt/user-http-request :crowberto :get 200 "action")
                  action-ids (into #{} (map :id) response)]
              (is (set/subset? (into #{} (map :action-id) [action-1 action-2 action-3])
                               action-ids))
              (doseq [action response
                      :when (= (:type action) "query")]
                (testing "Should return a query action deserialized (#23201)"
                  (is (malli= ExpectedGetQueryActionAPIResponse
                              action))))
              (testing "Does not have archived actions"
                (is (not (contains? action-ids (:id archived)))))
              (testing "Does not return actions on models without permissions"
                (let [rasta-list (mt/user-http-request :rasta :get 200 "action")]
                  (is (empty? (set/intersection (into #{} (map :action-id) [action-1 action-2 action-3])
                                                (into #{} (map :id) rasta-list)))))))))))))

(deftest get-action-test
  (testing "GET /api/action/:id"
    (mt/with-actions-enabled
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-actions [{:keys [action-id]} {}]
          (let [action (mt/user-http-request :crowberto :get 200 (format "action/%d" action-id))]
            (testing "Should return a query action deserialized (#23201)"
              (is (malli= ExpectedGetQueryActionAPIResponse
                          action))))
          (testing "Should not be allowed to get the action without permission on the model"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 (format "action/%d" action-id))))))))))

(deftest action-model-db-disagree-test
  (let [cross-db-action (fn cross-db-action [model-id other-db-id]
                          {:type        :query
                           :model_id    model-id            ;; model against one-db
                           :database_id other-db-id         ;; action against test-data
                           :name        "cross db action"
                           :dataset_query
                           {:native
                            {:query         "update people
                                             set source = {{source}}
                                             where id = {{id}}",
                             :template-tags {:source {:id           "source",
                                                      :name         "source",
                                                      :display-name "Source",
                                                      :type         "text"},
                                             :id     {:id           "id",
                                                      :name         "id",
                                                      :display-name "Id",
                                                      :type         "number"}}},
                            :database other-db-id
                            :type     "native"}
                           :parameters  [{:id     "id"
                                          :slug   "id"
                                          :type   :number
                                          :target [:variable
                                                   [:template-tag "id"]]}
                                         {:id       "source"
                                          :slug     "source"
                                          :type     :text
                                          :required false
                                          :target   [:variable
                                                     [:template-tag "source"]]}]})]
    (testing "when action's database and model's database disagree"
      (testing "Both dbs are checked for actions enabled at creation"
        (mt/dataset test-data
          (let [test-data-id (mt/id)]
            (mt/dataset time-test-data
              (mt/with-actions-enabled
                (is (not= (mt/id) test-data-id))
                (mt/with-temp [:model/Card model {:type          :model
                                                  :dataset_query (mt/native-query {:query "select * from checkins limit 1"})}]
                  (let [action   (cross-db-action (:id model) test-data-id)
                        response (mt/user-http-request :rasta :post 400 "action" action)]
                    (testing "Checks both databases for actions enabled"
                      (is (partial= {:message "Actions are not enabled."
                                     :data    {:database-id test-data-id}}
                                    response))))))))))
      (testing "When executing, both dbs are checked for enabled"
        (mt/dataset test-data
          (let [test-data-id (mt/id)]
            (mt/with-actions-test-data-and-actions-enabled
              (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query categories)}
                                {action-on-other-id :action-id} (cross-db-action model-id test-data-id)]
                (is (partial= {:message "Actions are not enabled."
                               :data    {:database-id test-data-id}}
                              (mt/user-http-request :rasta
                                                    :post 400
                                                    (format "action/%s/execute" action-on-other-id)
                                                   ;; Twitter is the current value so effectively a no-op
                                                    {:parameters {:id 1 :source "Twitter"}})))))))
        (testing "When actions are enabled on the other database"
          (mt/dataset test-data
            (let [test-data-id (mt/id)]
              (mt/with-actions-enabled
                (mt/with-temp [:model/Card model {:type          :model
                                                  :dataset_query (mt/native-query {:query "select * from checkins limit 1"})
                                                  :collection_id (:id (collection/user->personal-collection (mt/user->id :crowberto)))}]
                  (let [action (cross-db-action (:id model) test-data-id)]
                    (testing "Action creation should succeed when both databases have actions enabled"
                      (is (= "You don't have permissions to do that." (mt/user-http-request :rasta :post 403 "action" action)))
                      (is (=? {:name "cross db action"} (mt/user-http-request :crowberto :post 200 "action" action))))
                    (testing "Action execution should succeed when both databases have actions enabled"
                      (let [response (mt/user-http-request :crowberto :post "action" action)
                            url      (format "action/%s/execute" (:id response))
                            params   {:parameters {:id 1 :source "Twitter"}}]
                        (is (=? {:message "You don't have permissions to do that."}
                                (mt/user-http-request :rasta :post 403 url params)))
                        (is (= {:rows-affected 1} (mt/user-http-request :crowberto :post 200 url params)))))))))))))))

(deftest unified-action-create-test
  (mt/test-helpers-set-global-values!
    (mt/with-actions-enabled
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-actions-test-data-tables #{"users" "categories"}
          (mt/with-actions [{card-id :id} {:type :model :dataset_query (mt/mbql-query users)}
                            {exiting-implicit-action-id :action-id} {:type :implicit :kind "row/update"}]
            (doseq [initial-action (all-actions-default card-id)]
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
                                       (assoc :database_id (mt/id)
                                              :parameters (if (= "row/create" (:kind initial-action))
                                                            []
                                                            [{:id "id" :type "type/BigInteger" :special "hello"}]))))
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
                    (mt/with-temp [:model/Card {plain-card-id :id} {:dataset_query (mt/mbql-query users)}]
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
                    (is (= "Not found." (mt/user-http-request :crowberto :get 404 action-path)))))))))))))

(deftest implicit-actions-on-non-raw-model-test
  (testing "Implicit actions are not supported on models that have clauses (aggregation, sort, breakout, ...)"
    (mt/with-actions-enabled
      (mt/with-temp [:model/Card {model-id :id} {:dataset_query (mt/mbql-query users {:aggregation [[:count]]})
                                                 :type          :model}]
        (is (= "Implicit actions are not supported for models with clauses."
               (mt/user-http-request :crowberto :post 400 "action"
                                     {:name       "Implicit example"
                                      :type       "implicit"
                                      :model_id   model-id
                                      :kind       "row/create"
                                      :parameters [{:id "nonexistent" :special "shouldbeignored"} {:id "id" :special "hello"}]})))))))

(deftest snowplow-test
  (snowplow-test/with-fake-snowplow-collector
    (mt/with-actions-enabled
      (testing "Should send a snowplow event when"
        (mt/with-temp
          [:model/Card {card-id :id} {:type :model :dataset_query (mt/mbql-query users)}]
          (doseq [{:keys [type parameters] :as action} (all-actions-default card-id)]
            (let [new-action (mt/user-http-request :crowberto :post 200 "action" action)]
              (testing (format "adding an action of type %s" type)
                (is (=? {:user-id (str (mt/user->id :crowberto))
                         :data    {"action_id"      (:id new-action)
                                   "event"          "action_created"
                                   "num_parameters" (count parameters)
                                   "type"           type}}
                        (last (snowplow-test/pop-event-data-and-user-id!)))))

              (testing (format "update an action of type %s" type)
                (let [updated-action (mt/user-http-request :crowberto :put 200 (str "action/" (:id new-action)) {:name "new name"})]
                  (is (=? {:user-id (str (mt/user->id :crowberto))
                           :data    {"action_id"      (:id updated-action)
                                     "event"          "action_updated"
                                     "type"           type}}
                          (last (snowplow-test/pop-event-data-and-user-id!))))))

              (testing (format "delete an action of type %s" type)
                (mt/user-http-request :crowberto :delete 204 (str "action/" (:id new-action)))
                (is (=? {:user-id (str (mt/user->id :crowberto))
                         :data    {"action_id"      (:id new-action)
                                   "event"          "action_deleted"
                                   "type"           type}}
                        (last (snowplow-test/pop-event-data-and-user-id!))))))))))))

(deftest action-parameters-test
  (mt/with-actions-enabled
    (mt/with-temp [:model/Card {card-id :id} {:type :model}]
      (mt/with-model-cleanup [:model/Action]
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
            (is (true? (t2/select-one-fn :archived :model/Action :id action-id)))
            (mt/user-http-request :crowberto :put 200 action-path {:archived false})
            (is (false? (t2/select-one-fn :archived :model/Action :id action-id))))
          (testing "Validate POST"
            (testing "Required fields"
              (is (=? {:errors {:name "string"},
                       :specific-errors {:name ["missing required key, received: nil"]}}
                      (mt/user-http-request :crowberto :post 400 "action" {:type "http"})))
              (is (=? {:errors {:model_id "value must be an integer greater than zero."}
                       :specific-errors {:model_id ["missing required key, received: nil"]}}
                      (mt/user-http-request :crowberto :post 400 "action" {:type "http" :name "test"}))))
            (testing "Handles need to be valid jq"
              (is (=? {:errors {:response_handle "nullable string, and must be a valid json-query, something like '.item.title'"}
                       :specific-errors {:response_handle ["must be a valid json-query, something like '.item.title', received: \"body\""]}}
                      (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :response_handle "body"))))
              (is (=? {:errors {:error_handle "nullable string, and must be a valid json-query, something like '.item.title'"}
                       :specific-errors {:error_handle ["must be a valid json-query, something like '.item.title', received: \"x\""]}}
                      (mt/user-http-request :crowberto :post 400 "action" (assoc initial-action :error_handle "x"))))))
          (testing "Validate PUT"
            (testing "Template needs method and url"
              (is (=? {:specific-errors
                       {:template {:method ["missing required key, received: nil"], :url ["missing required key, received: nil"]}},
                       :errors {:template "nullable map where {:method -> <enum of GET, POST, PUT, DELETE, PATCH>, :url -> <string with length >= 1>, :body (optional) -> <nullable string>, :headers (optional) -> <nullable string>, :parameters (optional) -> <nullable sequence of map>, :parameter_mappings (optional) -> <nullable map>} with no other keys"}}
                      (mt/user-http-request :crowberto :put 400 action-path {:type "http" :template {}}))))
            (testing "Handles need to be valid jq"
              (is (=? {:errors {:response_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                       :specific-errors {:response_handle ["must be a valid json-query, something like '.item.title', received: \"body\""]}}
                      (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :response_handle "body"))))
              (is (=? {:errors {:error_handle "nullable string, and must be a valid json-query, something like '.item.title'"},
                       :specific-errors {:error_handle ["must be a valid json-query, something like '.item.title', received: \"x\""]}}
                      (mt/user-http-request :crowberto :put 400 action-path (assoc initial-action :error_handle "x")))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUBLIC SHARING ENDPOINTS                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private unshared-action-opts
  {:public_uuid       nil
   :made_public_by_id nil})

(defn- shared-action-opts []
  {:public_uuid       (str (random-uuid))
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
                (is (t2/exists? :model/Action :id action-id, :public_uuid uuid))
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
                     (t2/exists? :model/Action :id action-id, :public_uuid (:public_uuid action-opts)))))))

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
        (snowplow-test/with-fake-snowplow-collector
          (is (=? {:rows-affected 1}
                  (mt/user-http-request :crowberto
                                        :post 200
                                        (format "action/%s/execute" action-id)
                                        {:parameters {:id 1 :name "European"}})))
          (testing "send a snowplow event"
            (is (= {:data {"action_id" action-id
                           "event"     "action_executed"
                           "source"    "model_detail"
                           "type"      "query"}
                    :user-id (str (mt/user->id :crowberto))}
                   (last (snowplow-test/pop-event-data-and-user-id!))))))))))

(deftest execute-action-test-2
  (mt/with-actions-test-data-and-actions-enabled
    (mt/with-actions [{:keys [action-id]} (assoc unshared-action-opts :archived true)]
      (testing "Check that we get a 404 if the action is archived"
        (is (= "Not found."
               (mt/user-http-request :crowberto
                                     :post 404
                                     (format "action/%s/execute" action-id)
                                     {:parameters {:id 1 :name "European"}})))))))

(deftest execute-action-test-3
  (mt/with-actions-test-data-and-actions-enabled
    (mt/with-actions [{:keys [action-id]} unshared-action-opts]
      (let [nonexistent-id (inc (t2/select-one-pk :model/Action {:order-by [[:id :desc]]}))]
        (testing "Check that we get a 404 if the action doesn't exist"
          (is (= "Not found."
                 (mt/user-http-request :crowberto
                                       :post 404
                                       (format "action/%s/execute" nonexistent-id)
                                       {:parameters {:id 1 :name "European"}})))))
      (testing "Check that we get a 400 if actions are disabled for the database."
        (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-actions false}}
          (is (= "Actions are not enabled."
                 (:cause
                  (mt/user-http-request :crowberto
                                        :post 400
                                        (format "action/%s/execute" action-id)
                                        {:parameters {:id 1 :name "European"}})))))))))

(deftest parameter-ignore-test
  (mt/with-actions-test-data-tables #{"users"}
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [_ {:type :model :dataset_query (mt/mbql-query users)}
                        {action-id :action-id} {:type :implicit :kind "row/update"}]
        (testing "It strips out nil values"
          (let [run-action! #(mt/user-http-request :crowberto
                                                   :post 200
                                                   (format "action/%s/execute" action-id)
                                                   {:parameters {:id 1 :name % :last_login nil}})]
            (run-action! "Darth Vader")
            (let [[new-name last-login] (first (mt/rows (mt/run-mbql-query users {:breakout [$name $last_login] :filter [:= $id 1]})))]
              (is (= "Darth Vader" new-name))
              (is (some? last-login)))))))))

(deftest parameter-default-test
  (mt/with-actions-test-data-tables #{"users"}
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions-enabled
        (mt/with-actions [_ {:type :model :dataset_query (mt/mbql-query users)}
                          {action-id :action-id} {:type :implicit :kind "row/update"
                                                  :visualization_settings {:fields {"last_login" {:id           "last_login"
                                                                                                  :defaultValue "2023-04-01T00:00:00Z"}}}}]
          (testing "Missing parameters should be filled in with default values"
            (let [run-action! #(mt/user-http-request :crowberto
                                                     :post 200
                                                     (format "action/%s/execute" action-id)
                                                     {:parameters (merge {:id 1} %)})]
              (run-action! {:name "Darth Vader"})
              (let [[new-name last-login] (first (mt/rows (mt/run-mbql-query users {:breakout [$name $last_login] :filter [:= $id 1]})))]
                (is (= "Darth Vader" new-name))
                (is (= "2023-04-01T00:00:00Z" last-login)))))
          (testing "{<param-id>: null} means a parameter is missing, and should not be replaced with a default value"
            (let [run-action! #(mt/user-http-request :crowberto
                                                     :post 200
                                                     (format "action/%s/execute" action-id)
                                                     {:parameters (merge {:id 1} %)})]
              (run-action! {:name "Darth Vader" :last_login nil})
              (let [[new-name last-login] (first (mt/rows (mt/run-mbql-query users {:breakout [$name $last_login] :filter [:= $id 1]})))]
                (is (= "Darth Vader" new-name))
                (is (= "2023-04-01T00:00:00Z" last-login))))))))))

(deftest hidden-parameter-test
  (mt/with-actions-test-data-tables #{"users"}
    (mt/with-actions-enabled
      (mt/with-actions [_ {:type :model :dataset_query (mt/mbql-query users)}
                        {:keys [action-id]} {:type :implicit :kind "row/update"
                                             :visualization_settings {:fields {"name" {:id     "name"
                                                                                       :hidden true}}}}]
        (testing "Hidden parameter should fail gracefully"
          (testing "GET /api/action/:id/execute"
            (is (partial= {:message "No destination parameter found for #{\"name\"}. Found: #{\"last_login\" \"id\"}"}
                          (mt/user-http-request :crowberto :post 400 (format "action/%s/execute" action-id)
                                                {:parameters {:name "Darth Vader"}})))))))))

(deftest fetch-implicit-action-default-values-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-enabled
      (mt/with-actions [_                             {:type :model :dataset_query (mt/mbql-query venues {:fields [$id $name]})
                                                       :collection_id (:id (collection/user->personal-collection (mt/user->id :crowberto)))}
                        {create-action-id :action-id} {:type :implicit :kind "row/create"}
                        {update-action-id :action-id} {:type :implicit :kind "row/update"}
                        {delete-action-id :action-id} {:type :implicit :kind "row/delete"}
                        {http-action-id :action-id}   {:type :http}
                        {query-action-id :action-id}  {:type :query}]
        (testing "403 if user does not have permission to view the action"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (format "action/%d/execute" update-action-id) :parameters (json/encode {:id 1})))))

        (testing "404 if id does not exist"
          (is (= "Not found."
                 (mt/user-http-request :rasta :get 404 (format "action/%d/execute" Integer/MAX_VALUE) :parameters (json/encode {:id 1})))))

        (testing "returns empty map for actions that are not implicit"
          (is (= {}
                 (mt/user-http-request :crowberto :get 200 (format "action/%d/execute" http-action-id) :parameters (json/encode {:id 1}))))

          (is (= {}
                 (mt/user-http-request :crowberto :get 200 (format "action/%d/execute" query-action-id) :parameters (json/encode {:id 1})))))

        (testing "Can't fetch for create action"
          (is (= "Values can only be fetched for actions that require a Primary Key."
                 (mt/user-http-request :crowberto :get 400 (format "action/%d/execute" create-action-id) :parameters (json/encode {:id 1})))))

        (testing "fetch for update action return name and id"
          (is (= {:id 1 :name "Red Medicine"}
                 (mt/user-http-request :crowberto :get 200 (format "action/%d/execute" update-action-id) :parameters (json/encode {:id 1})))))

        (testing "fetch for delete action returns the id only"
          (is (= {:id 1}
                 (mt/user-http-request :crowberto :get 200 (format "action/%d/execute" delete-action-id) :parameters (json/encode {:id 1})))))

        (mt/with-actions-disabled
          (testing "error if actions is disabled"
            (is (= "Actions are not enabled."
                   (:message (mt/user-http-request :crowberto :get 400 (format "action/%d/execute" delete-action-id) :parameters (json/encode {:id 1})))))))))))

;; This is just to test the flow, a comprehensive tests for error type ares in
;; [[metabase.driver.sql-jdbc.actions-test/action-error-handling-test]]
(deftest action-error-handling-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions)
    (mt/with-actions-enabled
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-actions [{_card-id :id}           {:dataset_query (mt/mbql-query checkins) :type :model}
                          {update-action :action-id} {:type :implicit
                                                      :kind "row/update"}]
          (testing "an error in SQL will be caught and parsed to a readable erorr message"

            (is (= {:message "Unable to update the record."
                    :errors {:user_id "This User_id does not exist."}}
                   (mt/user-http-request :rasta :post 400 (format "action/%d/execute" update-action)
                                         {:parameters {"id" 1 "user_id" 99999}})))))))))

;; action browsing support apis

(deftest v2-database-test
  (testing "GET /api/action/v2/database"
    (mt/with-actions-enabled
      (testing "Returns databases with table editing enabled"
        (mt/with-temp [:model/Database {db-id :id} {:name        "Versace Mansion"
                                                    :description "Luxury fashion database"
                                                    :engine      "h2"
                                                    :settings    {:database-enable-table-editing true}}
                       :model/Table _ {:name "runway_table" :db_id db-id}]
          (is (some #(= % {:id db-id :name "Versace Mansion" :description "Luxury fashion database"})
                    (:databases (mt/user-http-request :crowberto :get 200 "action/v2/database"))))))

      (testing "Excludes databases without table editing enabled"
        (mt/with-temp [:model/Database {db-id :id} {:name        "Prada Outlet"
                                                    :description "Disabled fashion database"
                                                    :engine      "h2"
                                                    :settings    {:database-enable-table-editing false}}
                       :model/Table _ {:name "disabled_table" :db_id db-id}]
          (is (not (some #(= (:id %) db-id) (:databases (mt/user-http-request :crowberto :get 200 "action/v2/database")))))))

      (testing "Excludes databases without tables"
        (mt/with-temp [:model/Database {db-id :id} {:name        "Gucci Warehouse"
                                                    :description "Empty fashion database"
                                                    :engine      "h2"
                                                    :settings    {:database-enable-table-editing true}}]
          (is (not (some #(= (:id %) db-id) (:databases (mt/user-http-request :crowberto :get 200 "action/v2/database"))))))))))

(deftest v2-database-table-test
  (testing "GET /api/action/v2/database/:database-id/table"
    (mt/with-actions-enabled
      (mt/with-temp [:model/Database {db-id-1 :id} {:name     "Chanel Atelier"
                                                    :engine   "h2"
                                                    :settings {:database-enable-table-editing true}}
                     :model/Database {db-id-2 :id} {:name     "Armani Casa"
                                                    :engine   "h2"
                                                    :settings {:database-enable-table-editing true}}
                     :model/Table {table-id-1 :id} {:name         "oak_dining_table"
                                                    :display_name "Oak Dining Table"
                                                    :description  "Elegant oak dining furniture"
                                                    :schema       "public"
                                                    :db_id        db-id-1}
                     :model/Table {table-id-2 :id} {:name         "mahogany_coffee_table"
                                                    :display_name "Mahogany Coffee Table"
                                                    :description  "Luxurious mahogany coffee table"
                                                    :schema       "public"
                                                    :db_id        db-id-1}
                     :model/Table {table-id-3 :id} {:name         "leather_sofa_table"
                                                    :display_name "Leather Sofa Table"
                                                    :description  "Premium leather side table"
                                                    :schema       "public"
                                                    :db_id        db-id-2}
                     :model/Table _                {:name         "inactive_table"
                                                    :display_name "Inactive Table"
                                                    :description  "inactive"
                                                    :schema       "public"
                                                    :db_id        db-id-1
                                                    :active       false}]

        (testing "Returns only tables from the specified database, in alphabetical order"
          (is (=? {:tables [{:id table-id-2 :name "mahogany_coffee_table" :display_name "Mahogany Coffee Table"
                             :description "Luxurious mahogany coffee table" :schema "public"}
                            {:id table-id-1 :name "oak_dining_table" :display_name "Oak Dining Table"
                             :description "Elegant oak dining furniture" :schema "public"}]}
                  (mt/user-http-request :crowberto :get 200 (format "action/v2/database/%d/table" db-id-1))))
          (testing "Does not include tables from other databases"
            (let [tables (:tables (mt/user-http-request :crowberto :get 200 (format "action/v2/database/%d/table" db-id-1)))]
              (is (not (some #(= (:id %) table-id-3) tables))))))

        (testing "Returns 400 when table editing disabled"
          (t2/update! :model/Database db-id-1 {:settings {:database-enable-table-editing false}})
          (is (= "Table editing is not enabled for this database"
                 (mt/user-http-request :crowberto :get 400 (format "action/v2/database/%d/table" db-id-1)))))

        (testing "Returns 404 for non-existent database"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :get 404 "action/v2/database/99999/table"))))))))

(deftest v2-model-test
  (testing "GET /api/action/v2/model"
    (mt/with-actions-enabled
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Elite Agency"}]
        (mt/with-actions [{model-id-1 :id} {:type :model, :dataset_query (mt/mbql-query users)}
                          {action-id-1 :action-id} {:name     "Cindy Crawford Pose"
                                                    :type     :implicit
                                                    :kind     "row/create"
                                                    :archived false}
                          _                        {:name     "Retired Supermodel"
                                                    :type     :implicit
                                                    :kind     "row/delete"
                                                    :archived true}]
          (mt/with-actions [{model-id-2 :id} {:type :model, :dataset_query (mt/mbql-query venues)}
                            {action-id-2 :action-id} {:name     "Tyra Banks Strut"
                                                      :type     :implicit
                                                      :kind     "row/update"
                                                      :archived false}]
           ;; Update model metadata after creation, to work around limitations in with-actions
            (t2/update! :model/Card model-id-1 {:name                "Gisele Bundchen"
                                                :description         "Brazilian supermodel extraordinaire"
                                                :collection_id       coll-id
                                                :collection_position 1})
            (t2/update! :model/Card model-id-2 {:name                "Heidi Klum"
                                                :description         "German-American model and TV personality"
                                                :collection_position 2})

            (testing "Returns models that have actions"
              (let [response (mt/user-http-request :crowberto :get 200 "action/v2/model")]
                (is (=? {:models [{:id                  model-id-1
                                   :name                "Gisele Bundchen"
                                   :description         "Brazilian supermodel extraordinaire"
                                   :collection_id       coll-id
                                   :collection_position 1
                                   :collection_name     "Elite Agency"}
                                  {:id                  model-id-2
                                   :name                "Heidi Klum"
                                   :description         "German-American model and TV personality"
                                   :collection_id       nil
                                   :collection_position 2
                                   :collection_name     nil}]}
                        response))))

            (testing "Does not return models with only archived actions"
              (t2/update! :model/Action action-id-1 {:archived true})
              (t2/update! :model/Action action-id-2 {:archived true})
              (is (=? {:models []}
                      (mt/user-http-request :crowberto :get 200 "action/v2/model"))))

            (testing "Returns empty list when no models have actions"
              (t2/delete! :model/Action action-id-1)
              (t2/delete! :model/Action action-id-2)
              (is (=? {:models []}
                      (mt/user-http-request :crowberto :get 200 "action/v2/model"))))))))))

(deftest v2-actions-test
  (testing "GET /api/action/v2/"
    (mt/with-actions-enabled
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-actions-test-data-tables #{"users"}
          (mt/with-actions [{model-id :id} {:type :model :dataset_query (mt/mbql-query users)}
                            action-id-1 {:name            "Strike a Pose"
                                         :description     "A dummy HTTP action"
                                         :type            :http
                                         :model_id        model-id
                                         :template        {:method "GET"
                                                           :url    "https://example.com/{{x}}"}
                                         :parameters      [{:id "x" :type "text"}]
                                         :response_handle ".body"
                                         :error_handle    ".status >= 400"}
                            action-id-2 {:name          "Walk the Catwalk"
                                         :type          :query
                                         :model_id      model-id
                                         :dataset_query (mt/mbql-query venues)}
                            _           {:name          "Retired from Runway"
                                         :type          :query
                                         :model_id      model-id
                                         :dataset_query (mt/mbql-query users)
                                         :archived      true}]
            (testing "Requires either model-id or table-id parameter"
              (is (= "Either model-id or table-id parameter is required"
                     (mt/user-http-request :crowberto :get 400 "action/v2/"))))

            (testing "Cannot specify both model-id and table-id"
              (is (= "Cannot specify both model-id and table-id parameters"
                     (mt/user-http-request :crowberto :get 400 (str "action/v2/?model-id=" model-id "&table-id=1")))))

            (testing "Filters by model-id"
              (mt/with-actions [{other-model-id :id} {:type :model :dataset_query (mt/mbql-query venues)}
                                {action-id-4 :action-id} {:name        "Vogue Cover Shoot"
                                                          :description "Photo shoot for fashion magazine"
                                                          :type        :http
                                                          :model_id    other-model-id
                                                          :template    {:method "GET"
                                                                        :url    "https://vogue.com"}}]
                (is (=? {:actions [{:id (:action-id action-id-1), :name "Strike a Pose", :description "A dummy HTTP action"}
                                   {:id (:action-id action-id-2), :name "Walk the Catwalk", :description nil}]}
                        (mt/user-http-request :crowberto :get 200 (str "action/v2/?model-id=" model-id))))
                (testing "Returns actions for other model"
                  (is (=? {:actions [{:id          action-id-4
                                      :name        "Vogue Cover Shoot"
                                      :description "Photo shoot for fashion magazine"}]}
                          (mt/user-http-request :crowberto :get 200 (str "action/v2/?model-id=" other-model-id)))))))

            (testing "Returns 404 for non-existent model"
              (is (= "Not found."
                     (mt/user-http-request :crowberto :get 404 "action/v2/?model-id=99999"))))

            (testing "Supports table-id parameter"
              (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-table-editing true}}
                (mt/with-temp [:model/Table {table-id :id} {:name "dining_table" :db_id (mt/id)}
                               :model/Table {other-table-id :id} {:name "coffee_table" :db_id (mt/id)}]
                  (let [resp (mt/user-http-request :crowberto :get 200 (str "action/v2/?table-id=" table-id))]
                    (testing "Returns table actions with id, name, and description"
                      (is (=? {:actions [{:id neg-int? :name "Create" :description string?}
                                         {:id neg-int? :name "Update" :description string?}
                                         {:id neg-int? :name "Create or Update" :description string?}
                                         {:id neg-int? :name "Delete" :description string?}]}
                              resp)))
                    (testing "Returns different action IDs for the different tables"
                      (let [actions-1 (:actions resp)
                            actions-2 (:actions (mt/user-http-request :crowberto :get 200 (str "action/v2/?table-id=" other-table-id)))]
                        (is (seq actions-2))
                        (is (empty? (set/intersection (into #{} (map :id) actions-1)
                                                      (into #{} (map :id) actions-2))))))))))

            (testing "Requires permission on model"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (str "action/v2/?model-id=" model-id)))))))))))
