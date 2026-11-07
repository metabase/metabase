(ns metabase.cloud-migration.models.cloud-migration-test
  (:require
   [clj-http.fake :as http-fake]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.app-db.core :as mdb]
   [metabase.cloud-migration.models.cloud-migration :as cloud-migration]
   [metabase.cloud-migration.settings :as cloud-migration.settings]
   [metabase.cmd.copy :as copy]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(use-fixtures :each (fn [thunk]
                      (mt/discard-setting-changes [read-only-mode]
                        (thunk))))

(defmacro mock-external-calls!
  "Mock external calls around migration creation."
  [& body]
  `(with-redefs [cloud-migration/get-store-migration (constantly {:external_id 1 :upload_url "https://up.loady"})
                 cloud-migration/migrate! identity]
     ~@body))

(defn- start-migration!
  "Starts a cloud migration through the API, with external calls mocked, after ending the ones other tests left
  unfinished, since the API refuses to start one while another is ongoing."
  []
  (t2/update! :model/CloudMigration {:state [:not-in cloud-migration/terminal-states]} {:state :cancelled})
  (mock-external-calls! (mt/user-http-request :crowberto :post 200 "cloud-migration")))

(defn- fake-upload-route-handler
  [migration]
  {(:upload_url migration)
   (fn [{:keys [body request-method]}]
     ;; slurp it to progress the upload
     (slurp body)
     (is (= :put
            request-method))
     {:status 200})
   (cloud-migration/migration-url (:external_id migration) "/uploaded")
   (constantly {:status 201})})

(deftest cluster?-test
  (is (boolean? (cloud-migration/cluster?))))

(deftest abs-progress-test
  (is (= 51 (cloud-migration/abs-progress 0 51 99)))
  (is (= 75 (cloud-migration/abs-progress 50 51 99)))
  (is (= 99 (cloud-migration/abs-progress 100 51 99))))

(deftest migrate!-test
  (let [migration         (start-migration!)
        progress-calls    (atom {:setup  []
                                 :dump   []
                                 :upload []
                                 :done   []})
        orig-set-progress (mt/original-fn #'cloud-migration/set-progress)]
    ;; The redefs below are read on the test thread before the scheduler stops/starts;
    ;; if a future change dispatches `cluster?` or `set-progress` through a quartz worker
    ;; (which doesn't inherit `*local-redefs*`), revert that site to `with-redefs` per
    ;; the docstring of `with-dynamic-fn-redefs`.
    (mt/with-dynamic-fn-redefs [cloud-migration/cluster?     (constantly false)
                                cloud-migration/set-progress (fn [id state n]
                                                               (swap! progress-calls update state conj n)
                                                               (orig-set-progress id state n))]
      (http-fake/with-fake-routes-in-isolation (fake-upload-route-handler migration)
        (testing "works"
          (try
            (#'cloud-migration/migrate! migration)
            (finally
              (task/stop-scheduler!)))
          (is (-> @progress-calls :upload count (> 3))
              "several progress calls during upload")
          (is (->> @progress-calls :upload (every? #(and (<= 50 %) (< % 100))))
              "progress calls are between 50 (inclusive) and 100 (exclusive)")
          (is (= {:setup [1] :dump [20] :done [100]}
                 (dissoc @progress-calls :upload))
              "one progress call during other stages"))))))

(deftest migrate!-test-managed-scheduler
  (let [migration         (start-migration!)]
    (mt/with-dynamic-fn-redefs [cloud-migration/cluster?     (constantly false)]
      (http-fake/with-fake-routes-in-isolation (fake-upload-route-handler migration)
        (testing "works when quartz scheduler is running"
          (task/start-scheduler!)
          (try
            (let [ex (try
                       (#'cloud-migration/migrate! migration)
                       nil
                       (catch Throwable e
                         e))]
              (is (nil? ex)))
            (finally
              (task/stop-scheduler!))))))))

(deftest migrate!-test-2
  (testing "exits early on terminal state"
    (let [migration (start-migration!)]
      (mt/user-http-request :crowberto :put 200 "cloud-migration/cancel")
      (try
        (#'cloud-migration/migrate! migration)
        (finally
          (task/stop-scheduler!)))
      (is (< (:progress (t2/select-one :model/CloudMigration :id (:id migration))) 100))
      (is (not (cloud-migration.settings/read-only-mode))))))

(deftest read-only-login-test
  (let [identity-id (t2/select-one-pk :model/AuthIdentity :user_id (mt/user->id :rasta) :provider "password")
        before      (t2/select-one-fn :last_used_at :model/AuthIdentity :id identity-id)]
    (mt/with-temporary-setting-values [read-only-mode true]
      (mt/client :post 200 "session" (mt/user->credentials :rasta))
      (is (not= before (t2/select-one-fn :last_used_at :model/AuthIdentity :id identity-id))))))

(deftest read-only-model-writes-test
  (mt/with-temp [:model/Collection {id :id} {:name "original"}
                 :model/Collection {archived-id :id} {:archived true}]
    (let [collection-count (t2/count :model/Collection)]
      (mt/with-temporary-setting-values [read-only-mode true]
        (doseq [write! [#(mt/user-http-request :crowberto :put 403 (str "collection/" id) {:name "changed"})
                        #(mt/user-http-request :crowberto :post 403 "collection" {:name "new"})
                        #(mt/user-http-request :crowberto :delete 403 (str "collection/" archived-id))]]
          (is (re-find #"read-only" (write!))))
        (is (= "original" (t2/select-one-fn :name :model/Collection :id id)))
        (is (t2/exists? :model/Collection :id archived-id))
        (is (= collection-count (t2/count :model/Collection)))))))

(deftest read-only-user-creation-rolls-back-test
  (let [email (str (random-uuid) "@example.com")
        collection-count (t2/count :model/Collection)]
    (mt/with-temporary-setting-values [read-only-mode true]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"read-only"
                            (t2/insert! :model/User {:email email :first_name "New" :last_name "User"})))
      (is (not (t2/exists? :model/User :email email)))
      (is (= collection-count (t2/count :model/Collection))))))

(deftest read-only-column-exceptions-test
  (testing "Every changed column must be allowed"
    (is (#'cloud-migration/update-exempted? :report_card {:changes {:last_used_at nil}}))
    (is (not (#'cloud-migration/update-exempted?
              :report_card {:changes {:id 1 :last_used_at nil :updated_at nil :name "changed"}}))))
  (testing "Column exceptions require a nonempty update"
    (doseq [args [{} {:changes {}} {:rows [{:id 1}]}]]
      (is (not (#'cloud-migration/update-exempted? :report_card args)))))
  (testing "A full exception permits inserts and deletes"
    (is (#'cloud-migration/update-exempted? :login_history {})))
  (testing "FieldValues allow only the last_used_at touch"
    (is (#'cloud-migration/update-exempted? :metabase_fieldvalues {:changes {:last_used_at nil :updated_at nil}}))
    (is (not (#'cloud-migration/update-exempted? :metabase_fieldvalues {:changes {:values []}})))))

(deftest read-only-field-values-test
  (testing "Reading cached filter values works in read-only mode"
    (let [url (format "field/%d/values" (mt/id :categories :name))]
      (mt/user-http-request :crowberto :get 200 url)
      (mt/with-temporary-setting-values [read-only-mode true]
        (is (=? {:values seq}
                (mt/user-http-request :crowberto :get 200 url)))))))

(def ^:private read-only-mode-blocked-models
  "Models in [[copy/entities]] that are NOT in [[cloud-migration/read-only-mode-exceptions]].
  For any new model added to [[copy/entities]], you must decide whether to add it here or
  in [[cloud-migration/read-only-mode-exceptions]]."
  (into #{:metabot_permissions
          :model/Action
          :model/ApiKey
          :model/ApplicationPermissionsRevision
          :model/BookmarkOrdering
          :model/CardBookmark
          :model/Channel
          :model/ChannelTemplate
          :model/Collection
          :model/CollectionBookmark
          :model/CollectionPermissionGraphRevision
          :model/Comment
          :model/CommentReaction
          :model/Dashboard
          :model/DashboardBookmark
          :model/DashboardCard
          :model/DashboardCardSeries
          :model/DashboardTab
          :model/DataPermissions
          :model/Database
          :model/Dimension
          :model/Document
          :model/DocumentBookmark
          :model/EmbeddingTheme
          :model/Exploration
          :model/ExplorationBlock
          :model/ExplorationBookmark
          :model/ExplorationPage
          :model/ExplorationQuery
          :model/ExplorationThread
          :model/ExplorationThreadTimeline
          :model/Field
          :model/FieldUserSettings
          :model/Glossary
          :model/ImplicitAction
          :model/McpFeedback
          :model/McpGroupPermission
          :model/Measure
          :model/Metabot
          :model/MetabotConversation
          :model/MetabotFeedback
          :model/MetabotMessage
          :model/MetabotPrompt
          :model/MetabotSourceFeedback
          :model/MetabotUsedTable
          :model/ModelIndex
          :model/ModelIndexValue
          :model/ModerationReview
          :model/NativeQuerySnippet
          :model/Notification
          :model/NotificationCard
          :model/NotificationHandler
          :model/NotificationRecipient
          :model/NotificationSubscription
          :model/OAuthClient
          :model/OsiAiContext
          :model/ParameterCard
          :model/Permissions
          :model/PermissionsGroup
          :model/PermissionsGroupMembership
          :model/PermissionsRevision
          :model/PersistedInfo
          :model/Pulse
          :model/PulseCard
          :model/PulseChannel
          :model/PulseChannelRecipient
          :model/QueryAction
          :model/RecentViews
          :model/Revision
          :model/Secret
          :model/Segment
          :model/Table
          :model/TableUserSettings
          :model/Timeline
          :model/TimelineEvent
          :model/Transform
          :model/TransformDagRun
          :model/TransformJob
          :model/TransformJobRun
          :model/TransformJobTransformTag
          :model/TransformRun
          :model/TransformRunCancelation
          :model/TransformTag
          :model/TransformTransformTag}
        (when config/ee-available?
          [:model/ConnectionImpersonation
           :model/ContentDiagnosticsFinding
           :model/CustomVizPlugin
           :model/MetabotGroupLimit
           :model/MetabotInstanceLimit
           :model/Sandbox
           :model/TableRemapping
           :model/Tenant
           :model/TransformTest
           :model/TransformTestRun
           :model/Workspace
           :model/WorkspaceDatabase])))

(def ^:private read-only-mode-blocked-columns
  "The set of columns explicitly blocked for a model when in read-only-mode.
  If you add or remove a column from any of these models, you must decide whether to add or remove it here or
  in [[cloud-migration/read-only-mode-exceptions]]."
  {:model/AuthIdentity #{:confirmed_at
                         :created_at
                         :credentials
                         :expires_at
                         :id
                         :metadata
                         :provider
                         :provider_id
                         :user_id}
   :model/Card #{:archived
                 :archived_directly
                 :cache_invalidated_at
                 :cache_ttl
                 :card_schema
                 :collection_id
                 :collection_position
                 :collection_preview
                 :created_at
                 :creator_id
                 :dashboard_id
                 :database_id
                 :dataset_query
                 :dataset_query_metrics_v2_migration_backup
                 :description
                 :dimension_mappings
                 :dimensions
                 :display
                 :document_id
                 :embedding_params
                 :embedding_type
                 :enable_embedding
                 :entity_id
                 :initially_published_at
                 :legacy_query
                 :made_public_by_id
                 :metabase_version
                 :metabot_chart_id
                 :metabot_conversation_id
                 :name
                 :parameter_mappings
                 :parameters
                 :public_uuid
                 :public_uuid_prefix
                 :query_type
                 :result_metadata
                 :source_card_id
                 :table_id
                 :type
                 :view_count
                 :visualization_settings}
   :model/FieldValues #{:created_at
                        :field_id
                        :has_more_values
                        :hash_key
                        :human_readable_values
                        :id
                        :type
                        :values}})

(deftest read-only-mode-all-models-accounted-for-test
  (let [copied     (into #{} (map t2/table-name) copy/entities)
        exceptions (set (keys @#'cloud-migration/read-only-mode-exceptions))
        blocked    (into #{} (map t2/table-name) read-only-mode-blocked-models)]
    (testing "Every copied table is an exception or blocked, and nothing else is listed"
      (is (= copied (set/union exceptions blocked))
          (str "Add a new copied model to `read-only-mode-exceptions` if it must stay writable during a migration,"
               " otherwise to `read-only-mode-blocked-models`.")))
    (testing "No table is both an exception and blocked"
      (is (= #{} (set/intersection exceptions blocked))))))

(deftest read-only-mode-all-blocked-columns-accounted-for-test
  (mt/with-empty-h2-app-db!
    (let [exceptions (m/filter-vals set? @#'cloud-migration/read-only-mode-exceptions)]
      (testing "Every column-scoped exception lists its blocked columns"
        (is (= (set (keys exceptions))
               (into #{} (map t2/table-name) (keys read-only-mode-blocked-columns)))))
      (doseq [[model blocked] read-only-mode-blocked-columns
              :let [table   (t2/table-name model)
                    allowed (get exceptions table)
                    columns (into #{}
                                  (map (comp keyword u/lower-case-en))
                                  (keys (u.conn/app-db-column-types (mdb/app-db) table)))]]
        (testing model
          (testing "No column is both allowed and blocked"
            (is (= #{} (set/intersection allowed blocked))))
          (testing "Every column is allowed or blocked, and nothing else is listed"
            (is (= columns (set/union allowed blocked))
                (str "Add a new column to the model's entry in `read-only-mode-exceptions` if it must stay writable"
                     " during a migration, otherwise to `read-only-mode-blocked-columns`."))))))))

(deftest ^:synchronized store-url-test
  (testing "When not dev"
    (testing "get production store"
      (with-redefs [config/is-dev? false]
        (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default)))))
    (testing "Can force it with :mb-store-use-staging"
      (with-redefs [config/is-dev? false
                    config/config-bool (fn [k] (when (= k :mb-store-use-staging) true))]
        (is (= "https://store.staging.metabase.com" (#'cloud-migration.settings/store-url-default))))))
  (testing "When dev"
    (with-redefs [config/is-dev? true]
      (testing "uses staging url"
        (is (= "https://store.staging.metabase.com" (#'cloud-migration.settings/store-url-default))))
      (testing "But can force to prod"
        (mt/with-dynamic-fn-redefs [config/config-bool (fn [k] (when (= k :mb-store-use-staging) false))]
          (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default)))))))
  (testing "with custom url is set"
    (mt/with-dynamic-fn-redefs [config/config-str (fn [k] (when (= k :mb-store-url) "https://custom.store.com"))]
      (testing "in dev is honored"
        (with-redefs [config/is-dev? true]
          (is (= "https://custom.store.com" (#'cloud-migration.settings/store-url-default)))))
      (testing "not in dev is not honored"
        (with-redefs [config/is-dev? false]
          (is (= "https://store.metabase.com" (#'cloud-migration.settings/store-url-default))))))))
