(ns metabase.change-log.events-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.core :as change-log]
   [metabase.change-log.log :as change-log.log]
   [metabase.change-log.numbering :as change-log.numbering]
   [metabase.change-log.spec :as change-log.spec]
   [metabase.config.core :as config]
   [metabase.core.init-test :as init-test]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.resolution :as models.resolution]
   [metabase.models.spec-test-util :as spec-test-util]
   [metabase.permissions.core :as perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.pulse.db :as pulse.db]
   [metabase.sync.db :as sync.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection Types)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- logged-by
  "The `[table_name row_id action]` of the change log rows that `thunk` writes."
  [thunk]
  (let [top (or (:id (t2/query-one ["SELECT MAX(id) AS id FROM change_log"])) 0)]
    (thunk)
    (mapv (juxt :table_name :row_id :action)
          (t2/query ["SELECT table_name, row_id, action FROM change_log WHERE id > ? ORDER BY id" top]))))

(deftest log-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Database db {}
                     :model/Table    t  {:db_id (:id db)}]
        (testing "an insert, an update and a delete each log the row's table, id and action"
          (let [id   (atom nil)
                rows (logged-by #(do (reset! id (t2/insert-returning-pk! :model/Field {:table_id      (:id t)
                                                                                       :name          "f"
                                                                                       :base_type     :type/Text
                                                                                       :database_type "TEXT"}))
                                     (t2/update! :model/Field :id @id {:name "g"})
                                     (t2/delete! :model/Field :id @id)))]
            (is (= [["metabase_field" @id "insert"]
                    ["metabase_field" @id "update"]
                    ["metabase_field" @id "delete"]]
                   rows))))
        (testing "an update and a delete by primary key log the row"
          (mt/with-temp [:model/Field f {:table_id (:id t)}]
            (is (= [["metabase_field" (:id f) "update"]
                    ["metabase_field" (:id f) "delete"]]
                   ;; the linter asks for `:id`, but a bare key takes its own path through Toucan
                   #_{:clj-kondo/ignore [:metabase/t2-implicit-pk]}
                   (logged-by #(do (t2/update! :model/Field (:id f) {:name "h"})
                                   (t2/delete! :model/Field (:id f))))))))
        (testing "an update that changes nothing logs nothing"
          (is (= [] (logged-by #(t2/update! :model/Table :id (:id t) {:name (:name t)}))))
          (is (= [] (logged-by #(t2/update! :model/Table {:db_id (:id db)} {:active true})))))
        (testing "an update that changes one row of two logs the one it changes"
          (mt/with-temp [:model/Table other {:db_id (:id db), :active false}]
            (is (= #{["metabase_table" (:id other) "update"]}
                   (set (logged-by #(t2/update! :model/Table {:db_id (:id db)} {:active true})))))))
        (testing "an update that changes nothing logs nothing, on a model with a no-op before-update"
          (mt/with-temp [:model/Pulse     pulse {}
                         :model/Card      card  {:database_id (:id db)}
                         :model/PulseCard pc    {:pulse_id (:id pulse), :card_id (:id card), :include_csv false}]
            (is (= [] (logged-by #(t2/update! :model/PulseCard :id (:id pc) {:include_csv false}))))
            (is (= [["pulse_card" (:id pc) "update"]]
                   (logged-by #(t2/update! :model/PulseCard :id (:id pc) {:include_csv true}))))))
        (testing "an update that sets only ignored columns logs nothing"
          (mt/with-temp [:model/Field f {:table_id (:id t)}]
            (is (= [] (logged-by #(t2/update! :model/Field :id (:id f) {:fingerprint_version 99}))))
            (is (= 99 (t2/select-one-fn :fingerprint_version :model/Field :id (:id f))))
            (testing "and one that also sets another column logs the row"
              (is (= [["metabase_field" (:id f) "update"]]
                     (logged-by #(t2/update! :model/Field :id (:id f) {:fingerprint_version 100, :description "d"})))))))
        (testing "an update that matches no row logs nothing"
          (is (= [] (logged-by #(t2/update! :model/Table :id Integer/MAX_VALUE {:name "none"})))))
        (testing "`t2/insert!` logs the rows it inserts, and still returns their count"
          (let [names #{"f1" "f2"}
                n     (atom nil)
                rows  (logged-by #(reset! n (t2/insert! :model/Field (for [field-name names]
                                                                       {:table_id      (:id t)
                                                                        :name          field-name
                                                                        :base_type     :type/Text
                                                                        :database_type "TEXT"}))))]
            (is (= 2 @n))
            (is (= (set (t2/select-pks-set :model/Field :table_id (:id t) :name [:in names]))
                   (set (map second rows))))
            (is (every? #(= ["metabase_field" "insert"] [(first %) (last %)]) rows))))
        (testing "an insert that does not return the key throws in dev and test"
          (mt/with-temp [:model/Pulse pulse {}
                         :model/Card  card  {}]
            (let [insert! #(t2/insert-returning-instance! [:model/PulseCard :include_csv]
                                                          {:pulse_id (:id pulse), :card_id (:id card), :position 0})]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"row key missing" (insert!)))
              (testing "and in production it still inserts, and warns instead of logging"
                (with-redefs [config/is-prod? true]
                  (mt/with-log-messages-for-level [messages [metabase.change-log :warn]]
                    (is (= [] (logged-by insert!)))
                    (is (t2/exists? :model/PulseCard :pulse_id (:id pulse)))
                    (is (= 1 (count (messages))))))))))))))

(deftest wake-numbering-test
  (testing "a log wakes the numbering, but not in tests"
    (let [woken (atom 0)]
      (mt/with-dynamic-fn-redefs [change-log.numbering/stay-awake! #(swap! woken inc)]
        (#'change-log.log/log! [])
        (is (= 0 @woken))
        (with-redefs [config/is-test? false]
          (#'change-log.log/log! []))
        (is (= 1 @woken))))))

(deftest card-writes-are-logged-and-keep-model-hooks-test
  (testing "a Card is logged, and its model hooks still run"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database _ {}]
          (let [card    (atom nil)
                updated (atom nil)
                rows    (logged-by #(do (reset! card (t2/insert-returning-instance!
                                                      :model/Card
                                                      (-> (mt/with-temp-defaults :model/Card)
                                                          (dissoc :entity_id)
                                                          (assoc :updated_at #t "2023-02-02T01:00:00"))))
                                        (t2/update! :model/Card :id (:id @card) {:name "renamed"})
                                        (reset! updated (t2/select-one-fn :updated_at :model/Card :id (:id @card)))
                                        (t2/delete! :model/Card :id (:id @card))))]
            (is (= (for [action ["insert" "update" "delete"]]
                     ["report_card" (:id @card) action])
                   rows))
            (testing "entity-id: the insert set entity_id"
              (is (some? (:entity_id @card))))
            (testing "timestamped: the update set updated_at"
              (is (not= (:updated_at @card) @updated)))))))))

(deftest split-update-test
  (testing "an update that Toucan runs as one UPDATE per row logs each row once"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/Database db {}
                       :model/Table    t  {:db_id (:id db)}
                       :model/Field    f1 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}
                       :model/Field    f2 {:table_id (:id t), :base_type :type/Text, :effective_type :type/Text}]
          ;; before-update moves f2's effective_type back to its base_type, so the two rows get different changes
          (t2/update! :metabase_field :id (:id f2) {:effective_type "type/Integer"})
          (is (= [["metabase_field" (:id f1) "update"]
                  ["metabase_field" (:id f2) "update"]]
                 (sort (logged-by #(t2/update! :model/Field {:table_id (:id t)} {:description "x"}))))))))))

(deftest transaction-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/PermissionsGroup group {}]
        (testing "a write rolled back takes its log row with it"
          (is (= [] (logged-by #(try
                                  (t2/with-transaction [_conn]
                                    (t2/update! :model/PermissionsGroup :id (:id group) {:name "rolled back"})
                                    (throw (ex-info "boom" {})))
                                  (catch Exception _))))))))))

(deftest raw-write-test
  (testing "writes that bypass their model log their rows with `log-rows!`"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (mt/with-temp [:model/User             user  {}
                       :model/PermissionsGroup group {}]
          (testing "without `log-rows!`, a write that bypasses the model is not logged"
            (is (= [] (logged-by #(t2/update! :permissions_group :id (:id group) {:name "raw"})))))
          (testing "a group membership added"
            (let [rows (logged-by #(perms/add-user-to-group! user group))]
              (is (= [["permissions_group_membership"
                       (t2/select-one-pk :model/PermissionsGroupMembership :user_id (:id user) :group_id (:id group))
                       "insert"]]
                     rows))))
          (testing "a pulse channel's recipients removed in one delete"
            (mt/with-temp [:model/Pulse                 pulse {}
                           :model/PulseChannel          pc    {:pulse_id (:id pulse), :channel_type :email, :details {}}
                           :model/PulseChannelRecipient pcr   {:pulse_channel_id (:id pc), :user_id (:id user)}]
              (is (= [["pulse_channel_recipient" (:id pcr) "delete"]]
                     (logged-by #(pulse.db/delete-pulse-channel-recipients-raw! (:id pc) #{(:id user)})))))))
        (testing "a card linked to the Metabot conversation it was saved from"
          (mt/with-temp [:model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :crowberto)}
                         :model/Card                card                 {}]
            (is (= [["report_card" (:id card) "update"]]
                   (logged-by #(metabot.db/link-card-to-conversation! (:id card) conversation-id "chart"))))))
        (testing "the classifier's data sensitivity cleared, for a table and then for its database"
          (mt/with-temp [:model/Database db      {}
                         :model/Table    table-a {:db_id (:id db)}
                         :model/Table    table-b {:db_id (:id db)}
                         :model/Field    field-a {:table_id (:id table-a), :data_sensitivity :PII}
                         :model/Field    field-b {:table_id (:id table-b), :data_sensitivity :PII}]
            (is (= [["metabase_field" (:id field-a) "update"]]
                   (logged-by #(sync.db/reset-classifier-data-sensitivity-for-table! (:id table-a)))))
            (is (= [["metabase_field" (:id field-b) "update"]]
                   (logged-by #(sync.db/reset-classifier-data-sensitivity-for-database! (:id db)))))))
        (testing "every tenant deactivated"
          (mt/with-temp [:model/Tenant tenant {}]
            (t2/with-transaction [_conn nil {:rollback-only true}]
              (is (contains? (set (logged-by permissions.db/deactivate-all-tenants!))
                             ["tenant" (:id tenant) "update"])))))
        (testing "`log-rows!` on a model that is not tracked throws in dev and test"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"has no `metabase.change-log.core/spec`"
                                (change-log/log-rows! :model/Collection :update :id 1)))
          (testing "and in production it warns instead of logging"
            (with-redefs [config/is-prod? true]
              (mt/with-log-messages-for-level [messages [metabase.change-log :warn]]
                (is (= [] (logged-by #(change-log/log-rows! :model/Collection :update :id 1))))
                (is (= 1 (count (messages))))))))))))

(deftest foreign-keys-test
  (testing "reads the foreign keys that lead to tracked tables, with their ON DELETE rule, from the app DB"
    (let [fks  (change-log.cascade/foreign-keys)
          edge (fn [parent child column]
                 (some #(when (and (= child (:child %)) (= column (:column %))) (:rule %)) (get fks parent)))]
      (is (= :cascade (edge "metabase_database" "metabase_table" :db_id)))
      (is (= :cascade (edge "metabase_table" "metabase_field" :table_id)))
      (is (= :cascade (edge "metabase_field" "metabase_field_user_settings" :field_id)))
      (is (= :cascade (edge "pulse_channel" "pulse_channel_recipient" :pulse_channel_id)))
      (is (= :set-null (edge "metabase_field" "metabase_field" :fk_target_field_id)))
      (is (= :set-null (edge "report_card" "report_card" :source_card_id)))
      (testing "including those that reference a table that is not tracked"
        (is (= :cascade (edge "report_dashboardcard" "pulse_card" :dashboard_card_id)))
        (is (= :set-null (edge "collection" "report_card" :collection_id))))
      (testing "including a cascade to a table that is not tracked, when one of these references that table"
        (is (= :cascade (edge "report_dashboard" "report_dashboardcard" :dashboard_id))))
      (testing "and none to a table that is not tracked and that none of these references"
        (let [tracked (change-log.cascade/tracked-models)]
          (is (every? #(or (contains? tracked (:child %)) (contains? fks (:child %))) (mapcat val fks))))))))

(deftest tracked-model-keys-test
  (testing "each tracked model's key is one integer column"
    (spec-test-util/load-models!)
    (let [column-types (t2/with-connection [^Connection conn]
                         (with-open [rs (.getColumns (.getMetaData conn) (.getCatalog conn) (.getSchema conn) "%" "%")]
                           (into {}
                                 (map (fn [{:keys [table_name column_name data_type]}]
                                        [[(u/lower-case-en table_name) (u/lower-case-en column_name)] data_type]))
                                 (resultset-seq rs))))]
      (doseq [model (vals (change-log.cascade/tracked-models))
              :let  [pks (t2/primary-keys model)]]
        (is (= 1 (count pks))
            (str model " has a key of " (count pks) " columns"))
        (is (contains? #{Types/INTEGER Types/BIGINT Types/SMALLINT}
                       (column-types [(name (t2/table-name model)) (u/lower-case-en (name (first pks)))]))
            (str model "'s key is not an integer column"))))))

(deftest tracked-models-derive-events-test
  (testing "each tracked model derives the events trait, which collects the writes the change log records"
    (spec-test-util/load-models!)
    (doseq [model (vals (change-log.cascade/tracked-models))]
      (is (isa? model :hook/events) (str model " does not derive :hook/events")))))

(deftest cascade-sources-derive-events-test
  (testing "a model whose delete cascades to a tracked table derives the events trait, so the delete is captured"
    (let [models  (spec-test-util/load-models!)
          fks     (change-log.cascade/foreign-keys)
          sources (set (filter #(seq (change-log.cascade/referenced-columns fks (name (t2/table-name %)))) models))]
      (doseq [model sources]
        (is (isa? model :hook/events) (str model " does not derive :hook/events"))))))

(defn- startup-namespaces
  "The Metabase namespaces that the startup namespaces require in their `ns` forms, at any depth. EE's startup
  namespaces are those that `metabase.core.init` and `metabase.api-routes.routes` load."
  []
  (loop [todo  (cond-> ['metabase.core.core]
                 config/ee-available? (conj 'metabase-enterprise.core.init 'metabase-enterprise.api-routes.routes))
         found #{}]
    (if-let [[nspace & more] (seq todo)]
      (if (contains? found nspace)
        (recur more found)
        (recur (into more (filter #(re-find #"^metabase(-enterprise)?\." (str %))) (init-test/ns-requires nspace))
               (conj found nspace)))
      found)))

(deftest tracked-models-load-at-startup-test
  (testing "each tracked model's namespace loads at startup, so a delete that cascades to its rows logs them"
    (spec-test-util/load-models!)
    (let [startup (startup-namespaces)]
      (doseq [model (vals (change-log.cascade/tracked-models))]
        (is (contains? startup (models.resolution/model->namespace model))
            (str model "'s namespace does not load at startup: require it from a namespace that does"))))))

(def ^:private tracked-models
  "The models we want tracked. [[tracked-models-test]] checks that they are the models with a change-log spec."
  #{:model/Card
    :model/Dashboard
    :model/Database
    :model/Field
    :model/FieldUserSettings
    :model/NativeQuerySnippet
    :model/Notification
    :model/NotificationCard
    :model/NotificationHandler
    :model/NotificationRecipient
    :model/NotificationSubscription
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/Pulse
    :model/PulseCard
    :model/PulseChannel
    :model/PulseChannelRecipient
    :model/Table
    :model/Tenant
    :model/User})

(def ^:private untracked-models
  "The models we do not want tracked. [[tracked-models-test]] checks that none has a change-log spec. A new model
  goes here, or in [[tracked-models]] when a reader of the change log needs its changes."
  #{:model/Action
    :model/AgentApiCallLog
    :model/AiUsageLog
    :model/AnalysisFinding
    :model/AnalysisFindingError
    :model/AnalysisFindingStatus
    :model/ApiKey
    :model/ApiKeyUsageLog
    :model/ApplicationPermissionsRevision
    :model/AuditLog
    :model/AuthIdentity
    :model/BookmarkOrdering
    :model/CacheConfig
    :model/CardBookmark
    :model/CardTest
    :model/Channel
    :model/ChannelTemplate
    :model/CloudMigration
    :model/Collection
    :model/CollectionBookmark
    :model/CollectionPermissionGraphRevision
    :model/Comment
    :model/CommentReaction
    :model/ConnectionImpersonation
    :model/ContentDiagnosticsFinding
    :model/ContentTranslation
    :model/CustomVizPlugin
    :model/DashboardBookmark
    :model/DashboardCard
    :model/DashboardCardSeries
    :model/DashboardTab
    :model/DataApp
    :model/DatabaseRouter
    :model/DataComplexityScore
    :model/DataPermissions
    :model/DataTestRun
    :model/Dependency
    :model/DependencyStatus
    :model/Dimension
    :model/Document
    :model/DocumentBookmark
    :model/EmbeddingSdkReact18Host
    :model/EmbeddingTheme
    :model/Exploration
    :model/ExplorationBlock
    :model/ExplorationBookmark
    :model/ExplorationPage
    :model/ExplorationQuery
    :model/ExplorationQueryResult
    :model/ExplorationThread
    :model/ExplorationThreadTimeline
    :model/FieldValues
    :model/Glossary
    :model/ImpersonationQueryCache
    :model/ImplicitAction
    :model/LoginHistory
    :model/McpFeedback
    :model/McpGroupPermission
    :model/McpQueryHandle
    :model/McpSessionLog
    :model/McpToolCallLog
    :model/Measure
    :model/Metabot
    :model/MetabotConversation
    :model/MetabotFeedback
    :model/MetabotGroupLimit
    :model/MetabotInstanceLimit
    :model/MetabotMessage
    :model/MetabotPermissions
    :model/MetabotPrompt
    :model/MetabotSourceFeedback
    :model/MetabotUsedTable
    :model/ModelIndex
    :model/ModelIndexValue
    :model/ModerationReview
    :model/OAuthAccessToken
    :model/OAuthAuthorizationCode
    :model/OAuthClient
    :model/OAuthClientEvent
    :model/OAuthRefreshToken
    :model/OsiAiContext
    :model/ParameterCard
    :model/Permissions
    :model/PermissionsRevision
    :model/PersistedInfo
    :model/PremiumFeaturesCache
    :model/PythonLibrary
    :model/Query
    :model/QueryAction
    :model/QueryCache
    :model/QueryExecution
    :model/QueryField
    :model/QueryTable
    :model/RecentViews
    :model/RemoteSyncTask
    :model/ReplacementRun
    :model/ResultMetadataStatus
    :model/Revision
    :model/Sandbox
    :model/SearchIndexMetadata
    :model/Secret
    :model/SecurityAdvisory
    :model/Segment
    :model/SegmentTest
    :model/SemanticSearchTokenTracking
    :model/Session
    :model/Setting
    :model/SourceDimensionDaily
    :model/SourceDimensionProfileDaily
    :model/SourceMetricDaily
    :model/SourceSegmentCompositeDaily
    :model/SourceSegmentDaily
    :model/SqlParsingShadowDifference
    :model/SsoRelayState
    :model/StoredResult
    :model/StoredResultUse
    :model/SupportAccessGrantLog
    :model/TableIndex
    :model/TableRemapping
    :model/TableUserSettings
    :model/TaskHistory
    :model/TaskRun
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
    :model/TransformTest
    :model/TransformTransformTag
    :model/Undo
    :model/UserKeyValue
    :model/UserParameterValue
    :model/ViewLog
    :model/Workspace
    :model/WorkspaceDatabase})

(deftest tracked-models-test
  (let [models (set (spec-test-util/load-models!))]
    (testing "each model is in `tracked-models` or `untracked-models`, and not in both"
      (is (= models (set (filter models (concat tracked-models untracked-models)))))
      (is (empty? (filter tracked-models untracked-models))))
    (testing "the models in `tracked-models` are the tracked models of the change log"
      (is (= (set (filter models tracked-models))
             (change-log.spec/tracked-models))))
    (testing "both name only models"
      (is (empty? (remove models.resolution/model->namespace (concat tracked-models untracked-models)))))))

(deftest spec-columns-test
  (spec-test-util/load-models!)
  (doseq [model (change-log.spec/tracked-models)
          :let  [{:keys [track skip]} (change-log/spec model)]]
    (testing (str model)
      (testing "lists no column twice, and none of the columns that no spec lists"
        (is (= (count (concat track skip)) (count (set (concat track skip)))))
        (is (empty? (filter change-log.spec/implicit-columns (concat track skip)))))
      (testing "lists each column of its table under `:track` or `:skip`: put a new column where it belongs"
        (is (= (set/difference (spec-test-util/table-columns model) change-log.spec/implicit-columns)
               (set (concat track skip))))))))

(deftest lint-tables-test
  (testing "the `:metabase/change-log-raw-write` lint knows each tracked model and its table"
    (is (= tracked-models (set (keys toucan.db-ns/change-log-tables))))
    (doseq [model (spec-test-util/load-models!)
            :when (tracked-models model)]
      (is (= (t2/table-name model) (toucan.db-ns/change-log-tables model))))))

(deftest cascade-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Database          db      {}
                     :model/Table             t       {:db_id (:id db)}
                     :model/Field             f       {:table_id (:id t)}
                     :model/FieldUserSettings fus     {:field_id (:id f), :semantic_type :type/Email
                                                       :semantic_type_set true}
                     :model/Card              card    {:database_id (:id db)}
                     :model/Database          other   {}
                     :model/Table             other-t {:db_id (:id other)}
                     :model/Field             fk      {:table_id (:id other-t)}]
        (t2/update! :metabase_field :id (:id fk) {:fk_target_field_id (:id f)})
        (testing "a delete logs the rows ON DELETE CASCADE deletes, at any depth, and those ON DELETE SET NULL updates"
          (let [logged (set (logged-by #(t2/delete! :model/Database :id (:id db))))]
            (is (contains? logged ["metabase_database" (:id db) "delete"]))
            (is (contains? logged ["metabase_table" (:id t) "delete"]))
            (is (contains? logged ["metabase_field" (:id f) "delete"]))
            (is (contains? logged ["metabase_field_user_settings" (:id fus) "delete"]))
            (is (contains? logged ["report_card" (:id card) "delete"]))
            (is (contains? logged ["metabase_field" (:id fk) "update"]))
            (is (not-any? #(= (:id other-t) (second %)) (filter #(= "metabase_table" (first %)) logged)))
            (testing "and the database deleted and updated those rows"
              (is (nil? (t2/select-one :model/Field :id (:id f))))
              (is (nil? (t2/select-one-fn :fk_target_field_id :model/Field :id (:id fk)))))))))))

(deftest cascade-capture-per-statement-test
  (testing "a delete of several rows enumerates their cascades once, with a number of queries that does not grow with the rows"
    (when config/ee-available?
      (mt/with-premium-features #{:change-log}
        (letfn [(capture-queries [n]
                  (mt/with-temp [:model/Database db {}]
                    (doseq [i (range n)]
                      (t2/insert! :model/Table {:db_id (:id db), :name (str "t" i), :active true}))
                    (let [calls (atom [])
                          rows  (atom [])
                          orig  (dynamic-redefs/original-fn #'change-log.cascade/changes)]
                      (mt/with-dynamic-fn-redefs [change-log.cascade/changes
                                                  (fn [fks table deleted]
                                                    (t2/with-call-count [call-count]
                                                      (u/prog1 (doall (orig fks table deleted))
                                                        (when (= "metabase_table" table)
                                                          (swap! rows conj [table (count deleted)])
                                                          (swap! calls conj (call-count))))))]
                        (t2/delete! :model/Table :db_id (:id db)))
                      {:rows @rows, :queries (first @calls)})))]
          (let [one   (capture-queries 1)
                three (capture-queries 3)]
            (is (= [["metabase_table" 1]] (:rows one)))
            (is (= [["metabase_table" 3]] (:rows three)))
            (is (= (:queries one) (:queries three)))))))))

(deftest cascade-from-untracked-model-test
  (is (not (change-log.spec/tracked? :model/DashboardCard)))
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Dashboard     dash  {}
                     :model/Card          card  {}
                     :model/DashboardCard dc    {:dashboard_id (:id dash), :card_id (:id card)}
                     :model/Pulse         pulse {:dashboard_id (:id dash)}
                     :model/PulseCard     pc    {:pulse_id (:id pulse), :card_id (:id card)
                                                 :dashboard_card_id (:id dc)}]
        (testing "deleting a dashboard card, which is not logged, logs the subscription card deleted with it"
          (is (= [["pulse_card" (:id pc) "delete"]
                  ["pulse" (:id pulse) "update"]]
                 (logged-by #(t2/delete! :model/DashboardCard :id (:id dc))))
              "and the subscription, which takes the name of its dashboard")
          (is (nil? (t2/select-one :model/PulseCard :id (:id pc)))))))))

(deftest cascade-through-untracked-table-test
  (when config/ee-available?
    (mt/with-premium-features #{:change-log}
      (mt/with-temp [:model/Dashboard     dash  {}
                     :model/DashboardTab  tab   {:dashboard_id (:id dash)}
                     :model/Card          card  {}
                     :model/DashboardCard dc    {:dashboard_id (:id dash), :dashboard_tab_id (:id tab)
                                                 :card_id (:id card)}
                     :model/Pulse         pulse {:dashboard_id (:id dash)}
                     :model/PulseCard     pc    {:pulse_id (:id pulse), :card_id (:id card)
                                                 :dashboard_card_id (:id dc)}]
        (testing "deleting a dashboard tab logs the subscription card deleted with its dashboard card"
          (is (= [["pulse_card" (:id pc) "delete"]]
                 (logged-by #(t2/delete! :model/DashboardTab :id (:id tab)))))
          (is (nil? (t2/select-one :model/PulseCard :id (:id pc)))))))))

(defn- call-counts
  "The app-DB calls of an insert, an update and a delete of a permissions group."
  []
  (let [id (atom nil)]
    {:insert (t2/with-call-count [calls]
               (reset! id (t2/insert-returning-pk! :model/PermissionsGroup {:name (str (random-uuid))}))
               (calls))
     :update (t2/with-call-count [calls]
               (t2/update! :model/PermissionsGroup :id @id {:name (str (random-uuid))})
               (calls))
     :delete (t2/with-call-count [calls]
               (t2/delete! :model/PermissionsGroup :id @id)
               (calls))}))

(deftest call-count-test
  (mt/with-premium-features #{:change-log}
    (call-counts))
  (let [off (mt/with-premium-features #{}
              (call-counts))]
    (when config/ee-available?
      (let [on (mt/with-premium-features #{:change-log}
                 (call-counts))]
        (testing "while the change log is on, an insert and an update run one more query, and a delete runs more"
          (is (= (inc (:insert off)) (:insert on)))
          (is (= (inc (:update off)) (:update on)))
          (is (< (inc (:delete off)) (:delete on))))))))

(deftest off-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (mt/with-premium-features #{}
      (testing "without the `:change-log` feature, nothing is logged"
        (is (= [] (logged-by #(t2/update! :model/PermissionsGroup :id (:id group) {:name "unlicensed"})))))
      (testing "while the change log is off, `log-rows!` runs no query"
        (t2/with-call-count [calls]
          (is (nil? (change-log/log-rows! :model/PermissionsGroup :update :id (:id group))))
          (is (zero? (calls)))))
      (testing "and does not load the model, so it works on an EE model without EE"
        (is (nil? (change-log/log-rows! :model/Tenant :update)))))))
