(ns metabase-enterprise.osi-generation.demo-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.core :as generation]
   [metabase-enterprise.osi-generation.demo-api :as osi-generation]
   [metabase-enterprise.osi-generation.demo-page :as osi-generation-page]
   [metabase-enterprise.search.entity-retrieval.core :as entity-retrieval.ee]
   [metabase-enterprise.search.entity-retrieval.index-table :as entity-retrieval.index-table]
   [metabase-enterprise.search.entity-retrieval.reconcile :as entity-retrieval.reconcile]
   [metabase-enterprise.search.semantic.db.datasource :as semantic.db.datasource]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.entity-retrieval :as tools.entity-retrieval]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search]
   [metabase.search.entity-retrieval.mirror :as entity-retrieval.mirror]
   [metabase.search.entity-retrieval.spec :as spec]
   [metabase.server.routes :as server.routes]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest demo-requires-development-or-explicit-opt-in-test
  (with-redefs [config/dev-available? false
                config/config-bool  (constantly false)]
    (is (false? (#'osi-generation/enabled?))))
  (with-redefs [config/dev-available? false
                config/config-bool  (constantly true)]
    (is (true? (#'osi-generation/enabled?)))))

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
    (mt/with-dynamic-fn-redefs [spec/entity-basis (fn [_projection value]
                                                    (select-keys value [:name]))]
      (is (= :approved
             (#'osi-generation/context-state entity {:data_source :human, :basis {:name "Current name"}})))
      (is (= :approved
             (#'osi-generation/context-state entity {:data_source :human, :basis nil})))
      (is (= :approved-invalidated
             (#'osi-generation/context-state entity {:data_source :human, :basis {:name "Previous name"}})))
      (is (= :invalidated
             (#'osi-generation/context-state entity {:data_source :metabot, :basis nil}))))))

(deftest generated-context-state-changes-when-description-changes-test
  (mt/with-dynamic-fn-redefs [spec/entity-basis (fn [_projection value]
                                                  (select-keys value [:description]))]
    (is (= :invalidated
           (#'osi-generation/context-state
            {:description "Current description"}
            {:data_source :metabot, :basis {:description "Previous description"}})))))

(deftest update-library-description-test
  (let [update-call (atom nil)
        sync-call   (atom nil)]
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
                               1)
                  entity-retrieval.mirror/request-entity-sync! (fn [& args]
                                                                 (reset! sync-call args))]
      (is (= {:updated 1}
             (#'osi-generation/update-library-description! "metric" 7 "Changed source")))
      (is (= [:model/Card :id 7 {:description "Changed source"}] @update-call))
      (is (= ["metric" 7] @sync-call)))))

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
  (mt/with-dynamic-fn-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                              entity-retrieval.reconcile/clear-index! (fn [datasource]
                                                                        (is (= ::pgvector datasource))
                                                                        {:deleted 46})]
    (is (= {:deleted 46} (#'osi-generation/clear-library-index!)))))

(deftest library-index-entries-test
  (let [rows [{:doc_id "metric-name", :entity_type "metric", :entity_local_id 7}]]
    (with-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                  spec/member-entities (constantly [{:entity_type "metric", :entity_local_id 7}])
                  entity-retrieval.reconcile/with-index-read-lock (fn [datasource f]
                                                                    (is (= ::pgvector datasource))
                                                                    (f ::connection))
                  entity-retrieval.index-table/vectors-table-exists? (constantly true)
                  entity-retrieval.index-table/vectors-table-sql (constantly "library-index")
                  jdbc/execute! (fn [connection [sql members offset] _options]
                                  (is (= ::connection connection))
                                  (is (re-find #"LIMIT 51 OFFSET \?" sql))
                                  (is (re-find #"jsonb_to_recordset" sql))
                                  (is (= "[{\"entity_type\":\"card\",\"entity_local_id\":7}]" members))
                                  (is (= 50 offset))
                                  rows)]
      (is (= {:busy false, :data rows} (#'osi-generation/library-index-entries 50)))))
  (testing "busy index never scans membership"
    (mt/with-dynamic-fn-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                                entity-retrieval.reconcile/with-index-read-lock (fn [_ _] nil)
                                spec/member-entities (fn [& _] (throw (ex-info "unexpected scan" {})))]
      (is (= {:busy true, :data []} (#'osi-generation/library-index-entries 0))))))

(deftest index-entity-settled-test
  (let [stored (atom [{:doc_id "old"}])]
    (with-redefs [semantic.db.datasource/ensure-initialized-data-source! (constantly ::pgvector)
                  entity-retrieval.reconcile/with-index-read-lock (fn [_ f] (f ::connection))
                  entity-retrieval.index-table/vectors-table-exists? (constantly true)
                  entity-retrieval.index-table/vectors-table-sql (constantly "library-index")
                  spec/member-entity (fn [_ _ _] {:entity_type "metric", :entity_local_id 7})
                  spec/hydrate (fn [_ entities] entities)
                  spec/project (fn [_ _] [{:doc_id "new"}])
                  jdbc/execute! (fn [_ [_ id types] _]
                                  (is (= 7 id))
                                  (is (= "[\"card\",\"question\",\"metric\",\"model\"]" types))
                                  @stored)]
      (is (= {:busy false, :settled false} (#'osi-generation/index-entity-settled? "metric" 7)))
      (reset! stored [{:doc_id "new"}])
      (is (= {:busy false, :settled true} (#'osi-generation/index-entity-settled? "metric" 7))))))

(deftest comparison-search-test
  (let [search-context (atom nil)]
    (binding [api/*current-user-id*              42
              api/*current-user-permissions-set* (delay #{"/"})
              api/*is-superuser?*                true]
      (mt/with-dynamic-fn-redefs [perms/impersonated-user? (constantly false)
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
                (reify tools/Tool
                  (declaration [_] {})
                  (handle [_ input context]
                    (is (= {} context))
                    (is (= {:user_search_prompt "monthly revenue", :limit 10} input))
                    {:structured-output {:total_count 1
                                         :weak_match  false
                                         :data        [{:type             "metric"
                                                        :id               7
                                                        :name             "Revenue"
                                                        :matched_doc_type "synonym"
                                                        :matched_text     "sales"}]}}))]
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
  (with-redefs [t2/delete! (fn [model field value status-field status-filter]
                             (is (= :model/TaskHistory model))
                             (is (= :task field))
                             (is (= "osi-generation" value))
                             (is (= :status status-field))
                             (is (= [:not= :started] status-filter))
                             3)]
    (is (= {:deleted 3} (#'osi-generation/delete-generation-runs!)))))

(deftest vector-endpoint-decodes-document-id-test
  (let [result (promise)
        called (atom nil)]
    (with-redefs-fn {#'config/config-bool (constantly true)
                     #'api/check-superuser (constantly nil)
                     #'entity-retrieval.ee/available? (constantly true)
                     #'osi-generation/library-index-vector (fn [id] (reset! called id) {:vector "AQ=="})}
      #(osi-generation/routes {:request-method :get
                               :uri "/index/vector"
                               :metabase-user-id 1
                               :query-params {"doc-id" "a/b+c="}}
                              (fn [response] (deliver result response))
                              (fn [error] (deliver result error))))
    (is (= "a/b+c=" @called))
    (is (= {:vector "AQ=="} (:body @result)))))

(deftest demo-bare-route-redirects-to-gated-page-test
  (let [pass-through (fn [_ respond _] (respond nil))
        handler      (server.routes/make-routes {:api        pass-through
                                                 :auth       pass-through
                                                 :oauth      pass-through
                                                 :well-known pass-through})]
    (doseq [uri ["/dev/osi-generation" "/dev/osi-generation/"]]
      (let [result (promise)]
        (handler {:request-method :get, :uri uri} #(deliver result %) #(deliver result %))
        (is (= 302 (:status @result)))
        (is (= "/api/ee/osi-generation-demo-page/" (get-in @result [:headers "Location"])))))))

(deftest resources-are-packaged-test
  (mt/with-dynamic-fn-redefs [api/check-superuser (constantly nil)]
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

(deftest ^:synchronized pgvector-index-inspection-and-clear-test
  (when (semantic.db.datasource/dedicated-url-configured?)
    (let [suffix (System/nanoTime)
          ds (semantic.db.datasource/ensure-initialized-data-source!)
          model {:provider "mock", :model-name "demo", :vector-dimensions 4, :embedding-space-id "demo-test"}
          tables {:vectors (str "osi_demo_vectors_" suffix)
                  :meta    (str "osi_demo_meta_" suffix)}
          legacy {:vectors (str "osi_demo_legacy_vectors_" suffix)
                  :meta    (str "osi_demo_legacy_meta_" suffix)}]
      (binding [entity-retrieval.index-table/*tables* tables]
        (try
          (with-redefs [entity-retrieval.index-table/legacy-tables legacy
                        spec/member-entities (constantly [{:entity_type "metric", :entity_local_id 7}])]
            (is (= :created (entity-retrieval.index-table/ensure-tables! ds model)))
            (doseq [n (range 55)]
              (jdbc/execute! ds [(format (str "INSERT INTO %s "
                                              "(doc_id, entity_type, entity_local_id, doc_type, doc_text, doc_embedding) "
                                              "VALUES (?, 'metric', 7, 'name', ?, '[1,2,3,4]'::vector)")
                                         (entity-retrieval.index-table/vectors-table-sql))
                                 (format "doc%03d" n) (format "name%03d" n)]))
            (jdbc/execute! ds [(format (str "INSERT INTO %s "
                                            "(doc_id, entity_type, entity_local_id, doc_type, doc_text, doc_embedding) "
                                            "VALUES ('excluded', 'table', 999, 'name', 'outside', '[1,2,3,4]'::vector)")
                                       (entity-retrieval.index-table/vectors-table-sql))])
            (let [first-page (#'osi-generation/library-index-entries 0)
                  next-page  (#'osi-generation/library-index-entries 50)
                  vector     (#'osi-generation/library-index-vector "doc000")]
              (is (= 51 (count (:data first-page))))
              (is (= 5 (count (:data next-page))))
              (is (= "doc050" (:doc_id (first (:data next-page)))))
              (is (every? #(not (contains? % :vector_base64)) (:data first-page)))
              (is (seq (:vector vector))))
            (with-open [writer (jdbc/get-connection ds)]
              (let [lock-id (var-get #'entity-retrieval.reconcile/reconcile-lock-id)]
                (jdbc/execute! writer [(format "SELECT pg_advisory_lock(%d)" lock-id)])
                (try
                  (is (= {:busy true, :data []} (#'osi-generation/library-index-entries 0)))
                  (finally
                    (jdbc/execute! writer [(format "SELECT pg_advisory_unlock(%d)" lock-id)])))))
            ;; A legacy meta table may not have the optional freshness column.
            (jdbc/execute! ds [(format "ALTER TABLE %s DROP COLUMN reconciled_at"
                                       (entity-retrieval.index-table/meta-table-sql))])
            (is (= {:deleted 56} (entity-retrieval.reconcile/clear-index! ds)))
            (is (= :missing (entity-retrieval.index-table/index-status ds model)))
            (let [full-runs (atom 0)]
              (with-redefs-fn {#'entity-retrieval.reconcile/reconcile-against-appdb!
                               (fn [_ _] (swap! full-runs inc) {:inserted 0, :deleted 0, :unchanged 0})}
                #(entity-retrieval.reconcile/reconcile-entity! ds (constantly model) "metric" 7))
              (is (= 1 @full-runs) "the next targeted sync must rebuild the full index")))
          (finally
            (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s, %s"
                                       (entity-retrieval.index-table/vectors-table-sql)
                                       (entity-retrieval.index-table/meta-table-sql))])))))))
