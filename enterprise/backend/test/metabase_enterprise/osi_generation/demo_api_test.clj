(ns metabase-enterprise.osi-generation.demo-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.entity-retrieval.index-table :as entity-retrieval.index-table]
   [metabase-enterprise.entity-retrieval.reconcile :as entity-retrieval.reconcile]
   [metabase-enterprise.osi-generation.core :as generation]
   [metabase-enterprise.osi-generation.demo-api :as osi-generation]
   [metabase-enterprise.osi-generation.demo-page :as osi-generation-page]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.task.core :as task]
   [next.jdbc :as jdbc]
   [toucan2.core :as t2]))

(deftest demo-requires-development-or-explicit-opt-in-test
  (with-redefs [config/dev-available? false
                config/config-bool  (constantly false)]
    (is (false? (#'osi-generation/enabled?))))
  (with-redefs [config/dev-available? false
                config/config-bool  (constantly true)]
    (is (true? (#'osi-generation/enabled?)))))

#_{:clj-kondo/ignore [:metabase/tests-must-live-in-known-modules]}
(deftest library-entities-test
  (let [context {:entity_type     "card"
                 :entity_local_id 7
                 :ai_context      {:instructions "Use net revenue."}
                 :basis           {:name "Net revenue"}
                 :data_source     :metabot}
        api-context (dissoc context :basis)]
    (with-redefs [spec/member-entities (constantly [{:entity_type     "metric"
                                                     :entity_local_id 7
                                                     :name            "Net revenue"
                                                     :description     "Revenue after refunds."}
                                                    {:entity_type     "table"
                                                     :entity_local_id 2
                                                     :name            "Orders"
                                                     :description     nil}])
                  spec/hydrate         (fn [_ entities] entities)
                  spec/entity-basis    (fn [_ entity] (select-keys entity [:name]))
                  spec/entity-summary identity
                  t2/select           (fn [model]
                                        (is (some #{:basis} model))
                                        [context])]
      (is (= [{:entity_type     "metric"
               :entity_local_id 7
               :name            "Net revenue"
               :description     "Revenue after refunds."
               :context         api-context
               :generation_state :generated}
              {:entity_type     "table"
               :entity_local_id 2
               :name            "Orders"
               :description     nil
               :context         nil
               :generation_state :missing}]
             (#'osi-generation/library-entities))))))

(deftest approved-context-state-test
  (let [entity {:name "Current name"}]
    (with-redefs [spec/entity-basis (fn [_projection value]
                                      (select-keys value [:name]))]
      (is (= :approved
             (#'osi-generation/context-state entity {:data_source :human, :basis {:name "Current name"}})))
      (is (= :approved
             (#'osi-generation/context-state entity {:data_source :human, :basis nil})))
      (is (= :approved-invalidated
             (#'osi-generation/context-state entity {:data_source :human, :basis {:name "Previous name"}})))
      (is (= :invalidated
             (#'osi-generation/context-state entity {:data_source :metabot, :basis nil}))))))

(deftest update-library-description-test
  (let [update-call (atom nil)]
    (with-redefs [spec/member-entity (fn [projection entity-type entity-id]
                                       (is (= :osi-context projection))
                                       (is (= "metric" entity-type))
                                       (is (= 7 entity-id))
                                       {:entity_type "metric", :entity_local_id 7})
                  spec/entity-type->model (fn [entity-type]
                                            (is (= "metric" entity-type))
                                            :model/Card)
                  t2/update! (fn [& args]
                               (reset! update-call args)
                               1)]
      (is (= {:updated 1}
             (#'osi-generation/update-library-description! "metric" 7 "Changed source")))
      (is (= [:model/Card :id 7 {:description "Changed source"}] @update-call)))))

(deftest generation-prompt-test
  (let [context {:entity_type "table", :entity_local_id 2, :data_source :metabot
                 :basis {:description "Old"}, :ai_context {:synonyms ["purchases"]}}]
    (with-redefs [spec/member-entity (constantly {:entity_type "table", :entity_local_id 2
                                                  :name "Orders", :description "New"})
                  spec/hydrate       (fn [_ entities] entities)
                  spec/entity-basis  (fn [_ entity] (select-keys entity [:description]))
                  spec/basis-diff    (fn [old new] {:changed [:description], :from old, :to new})
                  spec/project       (fn [_ entity] (select-keys entity [:name :description]))
                  t2/select-one      (constantly context)]
      (let [{:keys [version messages]} (#'osi-generation/generation-prompt "table" 2)]
        (is (re-matches #"[0-9a-f]{12}" version))
        (is (= ["system" "user"] (mapv :role messages)))
        (is (re-find #"purchases" (get-in messages [1 :content])))
        (is (re-find #"description: was" (get-in messages [1 :content])))))))

(deftest ensure-generation-job-test
  (let [registered? (atom false)
        started?    (atom false)]
    (with-redefs [task/scheduler-disabled? (constantly false)
                  task/start-scheduler!    #(reset! started? true)
                  task/job-exists?         (fn [job-key]
                                             (is (= generation/generation-job-key job-key))
                                             @registered?)
                  task/init!               (fn [task-key]
                                             (is (= @#'osi-generation/generation-task-key task-key))
                                             (reset! registered? true))
                  task/job-info            (constantly {:key "generation"})
                  task/scheduler           (constantly nil)]
      (is (= {:scheduler {:disabled    false
                          :initialized false
                          :started     false
                          :standby     false
                          :shutdown    false}
              :job       {:registered true
                          :info       {:key "generation"}}}
             (#'osi-generation/ensure-generation-job!)))
      (is @started?)
      (is @registered?))))

(deftest generation-runs-test
  (with-redefs [t2/select (constantly [{:id           9
                                        :status       :success
                                        :started_at   "2026-09-08T03:00:00Z"
                                        :ended_at     "2026-09-08T03:00:02Z"
                                        :duration     2000
                                        :task_details {:outcome :completed
                                                       :summary {:generated 3}}}
                                       {:id           8
                                        :status       :failed
                                        :started_at   "2026-09-08T02:00:00Z"
                                        :ended_at     "2026-09-08T02:00:01Z"
                                        :duration     1000
                                        :task_details {:outcome :failed
                                                       :message "Provider unavailable"}}])]
    (is (= [{:id         9
             :status     :success
             :started_at "2026-09-08T03:00:00Z"
             :ended_at   "2026-09-08T03:00:02Z"
             :duration   2000
             :outcome    :completed
             :summary    {:generated 3}}
            {:id         8
             :status     :failed
             :started_at "2026-09-08T02:00:00Z"
             :ended_at   "2026-09-08T02:00:01Z"
             :duration   1000
             :outcome    :failed
             :message    "Provider unavailable"}]
           (#'osi-generation/generation-runs)))))

(deftest delete-all-contexts-test
  (with-redefs [t2/delete! (fn [model]
                             (is (= :model/OsiAiContext model))
                             4)]
    (is (= {:deleted 4} (#'osi-generation/delete-all-contexts!)))))

(deftest clear-library-index-test
  (with-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                entity-retrieval.reconcile/clear-index! (fn [datasource]
                                                          (is (= ::pgvector datasource))
                                                          {:deleted 46})]
    (is (= {:deleted 46} (#'osi-generation/clear-library-index!)))))

(deftest library-index-entries-test
  (let [rows [{:doc_id "metric-name", :entity_type "metric", :entity_local_id 7
               :doc_type "name", :doc_text "Revenue", :vector_dimensions 1024
               :vector_hash "852f", :vector_base64 "AAE="}
              {:doc_id "other-table", :entity_type "table", :entity_local_id 7
               :doc_type "name", :doc_text "Orders", :vector_dimensions 1024
               :vector_hash "61aa", :vector_base64 "AAI="}]]
    (with-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                  spec/member-entities (constantly [{:entity_type "metric", :entity_local_id 7}])
                  entity-retrieval.reconcile/with-index-read-lock (fn [datasource f]
                                                                    (is (= ::pgvector datasource))
                                                                    (f ::connection))
                  entity-retrieval.index-table/vectors-table-exists? (constantly true)
                  entity-retrieval.index-table/vectors-table-sql (constantly "library-index")
                  jdbc/execute! (fn [connection [_sql] _options]
                                  (is (= ::connection connection))
                                  rows)]
      (is (= {:busy false, :data [(first rows)]}
             (#'osi-generation/library-index-entries))))))

(deftest comparison-search-test
  (let [search-context (atom nil)]
    (binding [api/*current-user-id*              42
              api/*current-user-permissions-set* (delay #{"/"})
              api/*is-superuser?*                true]
      (with-redefs [perms/impersonated-user? (constantly false)
                    perms/sandboxed-user?    (constantly false)
                    search/search-context    identity
                    search/search            (fn [context]
                                               (reset! search-context context)
                                               {:engine :search.engine/semantic, :total 0, :data []})]
        (is (= {:engine :search.engine/semantic, :total 0, :data []}
               (#'osi-generation/comparison-search "semantic" "customer trends")))
        (is (= {:context               :api
                :current-user-id       42
                :current-user-perms    #{"/"}
                :is-impersonated-user? false
                :is-sandboxed-user?    false
                :is-superuser?         true
                :limit                 10
                :models                nil
                :offset                0
                :search-engine         "semantic"
                :search-string         "customer trends"}
               @search-context))))))

(deftest library-retrieval-search-test
  (with-redefs [tools.entity-retrieval/retrieve-library-entities-tool
                (fn [input]
                  (is (= {:user_search_prompt "monthly revenue", :limit 10} input))
                  {:structured-output {:total_count 1
                                       :weak_match  false
                                       :data        [{:type             "metric"
                                                      :id               7
                                                      :name             "Revenue"
                                                      :matched_doc_type "synonym"
                                                      :matched_text     "sales"}]}})]
    (is (= {:engine     :library-retrieval
            :total      1
            :weak_match false
            :data       [{:type             "metric"
                          :id               7
                          :name             "Revenue"
                          :matched_doc_type "synonym"
                          :matched_text     "sales"}]}
           (#'osi-generation/library-retrieval-search "monthly revenue")))))

(deftest delete-generation-runs-test
  (with-redefs [t2/delete! (fn [model field value]
                             (is (= :model/TaskHistory model))
                             (is (= :task field))
                             (is (= "osi-generation" value))
                             3)]
    (is (= {:deleted 3} (#'osi-generation/delete-generation-runs!)))))

(deftest resources-are-packaged-test
  (with-redefs [api/check-superuser (constantly nil)]
    (doseq [[path content-type expected]
            [["metabase_enterprise/osi_generation/demo/osi_generation.html"
              "text/html"
              "OSI generation lab"]
             ["metabase_enterprise/osi_generation/demo/osi_generation.css"
              "text/css"
              "--blue"]
             ["metabase_enterprise/osi_generation/demo/osi_generation.js"
              "application/javascript"
              "runComparisonSearch"]]]
      (let [response (#'osi-generation-page/resource-response path content-type)]
        (is (= 200 (:status response)))
        (is (= content-type (get-in response [:headers "Content-Type"])))
        (is (re-find (re-pattern expected) (:body response)))))))
