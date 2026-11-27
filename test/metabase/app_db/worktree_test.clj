(ns metabase.app-db.worktree-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test :as schema-migrations-test]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private synced-table-allowlist
  "The models of synced content tables without `worktree_id` or the hook; a synced table without the scope is a bug unless remote
  sync never syncs it per worktree, so this is expected to stay empty."
  #{})

(def ^:private referencing-table-allowlist
  "The models of tables reaching synced content through foreign keys without `worktree_id` and the hook; scope such a table unless a
  decision keeps it instance-wide."
  #{;; They are of the main app only, shared across worktrees like data permissions.
    :model/Metabot
    :model/MetabotPrompt
    :model/Permissions
    :model/Sandbox
    :model/Tenant})

(def ^:private scoped-tables
  "The models of other tables, with `worktree_id` and the hook; scope a table whose rows belong to one worktree's
  content: logs of content activity, polymorphic references to content such as revisions, view logs, recent views and
  comments, and per-worktree caches."
  #{;; They point at content polymorphically, by model and id or entity id, without a foreign key.
    :model/AuditLog
    :model/BookmarkOrdering
    :model/CacheConfig
    :model/ChangeLog
    :model/Comment
    :model/CommentReaction
    :model/ModerationReview
    :model/RecentViews
    :model/Revision
    :model/ViewLog
    ;; They are dependency and analysis records keyed by entity ids.
    :model/AnalysisFinding
    :model/AnalysisFindingError
    :model/AnalysisFindingStatus
    :model/Dependency
    :model/DependencyStatus
    :model/ResultMetadataStatus
    ;; They are usage metadata and source replacement records keyed by entity ids.
    :model/ReplacementRun
    :model/SourceDimensionDaily
    :model/SourceDimensionProfileDaily
    :model/SourceMetricDaily
    :model/SourceSegmentCompositeDaily
    :model/SourceSegmentDaily
    ;; They are notifications whose payload names content polymorphically.
    :model/Notification
    :model/NotificationHandler
    :model/NotificationRecipient
    :model/NotificationSubscription
    ;; They are runs and logs of each worktree.
    :model/DataTestRun
    :model/QueryExecution
    :model/RemoteSyncTask
    :model/TaskHistory
    :model/TaskRun})

(def ^:private unscoped-tables
  "The models of other tables, without `worktree_id` or the hook; leave instance-wide data unscoped."
  #{;; Instance-wide data: warehouse metadata, users, groups, sessions, settings, Metabot, tenants, transform jobs and
    ;; the like.
    :model/AgentApiCallLog
    :model/AiUsageLog
    :model/ApiKey
    :model/ApiKeyUsageLog
    :model/ApplicationPermissionsRevision
    :model/AuthIdentity
    :model/Channel
    :model/ChannelTemplate
    :model/CloudMigration
    :model/CollectionPermissionGraphRevision
    :model/ConnectionImpersonation
    :model/ContentTranslation
    :model/Session
    :model/User
    :model/CustomVizPlugin
    :model/DataComplexityScore
    :model/Undo
    :model/DataPermissions
    :model/DatabaseRouter
    :model/EmbeddingSdkReact18Host
    :model/EmbeddingTheme
    :model/ImpersonationQueryCache
    :model/LoginHistory
    :model/McpFeedback
    :model/McpGroupPermission
    :model/McpQueryHandle
    :model/McpSessionLog
    :model/McpToolCallLog
    :model/Database
    :model/Field
    :model/FieldValues
    :model/Table
    :model/MetabotConversation
    :model/MetabotFeedback
    :model/MetabotGroupLimit
    :model/MetabotInstanceLimit
    :model/MetabotMessage
    :model/MetabotPermissions
    :model/MetabotSourceFeedback
    :model/MetabotUsedTable
    :model/OAuthAccessToken
    :model/OAuthAuthorizationCode
    :model/OAuthClient
    :model/OAuthClientEvent
    :model/OAuthRefreshToken
    :model/OsiAiContext
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/PermissionsRevision
    :model/PremiumFeaturesCache
    :model/Query
    :model/QueryCache
    :model/RemoteSyncWorktree
    :model/SearchIndexMetadata
    :model/Secret
    :model/SecurityAdvisory
    :model/SemanticSearchTokenTracking
    :model/Setting
    :model/SqlParsingShadowDifference
    :model/SsoRelayState
    :model/StoredResult
    :model/SupportAccessGrantLog
    :model/TableRemapping
    :model/TransformJob
    :model/TransformJobRun
    :model/UserKeyValue
    :model/Workspace
    :model/WorkspaceDatabase})

(def ^:private worktree-reference-tables
  "The models of other tables, with `worktree_id` but without the hook, since the column names a worktree rather than
  scoping the row."
  #{;; Its worktree_id is the user's checked-out worktree.
    :model/RemoteSyncWorktreeUser})

(defn- model-table
  "The lower-cased table of `model`."
  [model]
  (u/lower-case-en (name (t2/table-name model))))

(defn- tables-of
  "The lower-cased tables of the loaded ones of `models`."
  [models]
  (into #{} (comp (filter #(isa? % :metabase/model)) (map model-table)) models))

(defn- model-tables
  "The lower-cased tables of every loaded model."
  []
  (tables-of (keys models.resolution/model->namespace)))

(defn- content-roots
  "The lower-cased tables of every model that remote sync syncs, of the models loaded."
  []
  (tables-of (remove #{:default} (remote-sync/synced-models))))

(defn- paths-to-content
  "Each table of `schema` that reaches one of `roots` through foreign keys, other than those on `worktree_id`,
  self-references and those to one of the unscoped tables `stops`, mapped to the path of `table.column -> parent`
  steps it takes."
  [schema roots stops]
  (loop [paths (into {} (map (fn [root] [root [root]])) roots)]
    (let [found (into {}
                      (for [[table {:keys [fks]}] schema
                            :when                 (not (contains? paths table))
                            [column parent]       fks
                            :when                 (and (contains? paths parent)
                                                       (not (contains? stops parent))
                                                       (not= "worktree_id" column)
                                                       (not= table parent))]
                        [table (into [(str table "." column " -> " parent)] (paths parent))]))]
      (if (empty? found)
        paths
        (recur (merge found paths))))))

(defn- hooked-tables
  "The lower-cased tables of the loaded models that derive `:hook/worktree-id`."
  []
  (into #{}
        (comp (filter #(= "model" (namespace %)))
              (map model-table))
        (descendants :hook/worktree-id)))

(defn- decision
  "The decision the app DB and the models make for `table`: `:scoped`, `:unscoped` or `:worktree-reference`, or the
  pair of facts that match none of them."
  [schema hooked table]
  (let [column? (contains? (schema-migrations-test/worktree-tables schema) table)
        hook?   (contains? hooked table)]
    (cond
      (and column? hook?)               :scoped
      (and (not column?) (not hook?))   :unscoped
      (and column? (not hook?))         :worktree-reference
      :else                             :hook-without-column)))

(defn- mismatches
  "The lines naming each of `tables` whose decision differs from `expected`, a fn of the table, with `paths` when given."
  [schema hooked tables expected paths]
  (for [table (sort tables)
        :let  [actual (decision schema hooked table)]
        :when (not= (expected table) actual)]
    (cond-> (format "%s: expected %s, found %s" table (expected table) actual)
      (paths table) (str " (" (str/join ", " (paths table)) ")"))))

(deftest synced-content-tables-are-scoped-test
  (when config/ee-available?
    (models.resolution/load-all-models!)
    (testing "every synced content table has worktree_id and its models derive :hook/worktree-id"
      (let [schema (schema-migrations-test/app-db-schema)
            roots  (set/difference (set/intersection (content-roots) (set (keys schema)))
                                   (tables-of synced-table-allowlist))
            bad    (mismatches schema (hooked-tables) roots (constantly :scoped) {})]
        (is (empty? bad) (str "Synced content tables that are not scoped:\n" (str/join "\n" bad)))))))

(deftest tables-referencing-synced-content-are-scoped-test
  (when config/ee-available?
    (models.resolution/load-all-models!)
    (testing "every table reaching synced content through foreign keys has worktree_id and the hook"
      (let [schema (schema-migrations-test/app-db-schema)
            roots  (content-roots)
            paths  (select-keys (paths-to-content schema roots (tables-of referencing-table-allowlist)) (keys schema))
            tables (set/difference (set/intersection (set (keys paths)) (model-tables))
                                   roots
                                   (tables-of referencing-table-allowlist))
            bad    (mismatches schema (hooked-tables) tables (constantly :scoped) paths)]
        (is (empty? bad) (str "Tables reaching synced content that are not scoped:\n" (str/join "\n" bad)))))))

(deftest remaining-tables-match-decisions-test
  (when config/ee-available?
    (models.resolution/load-all-models!)
    (testing "every remaining app DB table with a model is in exactly one decision set and matches it"
      (let [schema    (schema-migrations-test/app-db-schema)
            hooked    (hooked-tables)
            roots     (content-roots)
            reaching  (set (keys (paths-to-content schema roots (tables-of referencing-table-allowlist))))
            remaining (set/difference (set/intersection (set (keys schema)) (model-tables)) roots reaching)
            decisions (update-vals {:scoped             scoped-tables
                                    :unscoped           unscoped-tables
                                    :worktree-reference worktree-reference-tables}
                                   tables-of)
            listed    (reduce into #{} (vals decisions))
            expected  (into {} (for [[d tables] decisions, table tables] [table d]))]
        (is (= (count listed) (reduce + (map count (vals decisions))))
            (str "Tables in more than one decision set:\n"
                 (str/join "\n" (sort (for [[table n] (frequencies (mapcat seq (vals decisions))) :when (> n 1)] table)))))
        (is (empty? (set/difference remaining listed))
            (str "Tables whose models are in no decision set:\n"
                 (str/join "\n" (for [table (sort (set/difference remaining listed))]
                                  (format "%s %s" (pr-str table) (decision schema hooked table))))))
        (is (empty? (set/difference listed remaining))
            (str "Stale entries of the decision sets:\n" (str/join "\n" (sort (set/difference listed remaining)))))
        (let [bad (mismatches schema hooked (set/intersection remaining listed) expected {})]
          (is (empty? bad) (str "Tables that do not match their decision:\n" (str/join "\n" bad))))))))

(defn- visible-ids
  "The ids among `ids` of the rows of `model` that a thread working in `scope` reads."
  [scope model ids]
  (mdb/with-worktree-scope scope
    (set (t2/select-pks-set model :id [:in ids]))))

(deftest content-is-isolated-per-worktree-test
  (when config/ee-available?
    (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id}       {:branch "test-branch"}
                   :model/RemoteSyncWorktree {other-worktree-id :id} {:branch "other-branch"}
                   :model/Collection         {main-collection-id :id} {}
                   :model/Card               {main-card-id :id}       {:collection_id main-collection-id}
                   :model/Dashboard          {main-dashboard-id :id}  {:collection_id main-collection-id}]
      (let [worktree-scope       {:type :worktree :worktree-id worktree-id}
            other-worktree-scope {:type :worktree :worktree-id other-worktree-id}]
        (mdb/with-worktree-scope worktree-scope
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Card       {card-id :id}       {:collection_id collection-id}
                         :model/Dashboard  {dashboard-id :id}  {:collection_id collection-id}]
            (doseq [[model main-id worktree-row-id] [[:model/Collection main-collection-id collection-id]
                                                     [:model/Card main-card-id card-id]
                                                     [:model/Dashboard main-dashboard-id dashboard-id]]
                    :let [ids [main-id worktree-row-id]]]
              (testing model
                (testing "worktree reads its own rows and not default worktree's"
                  (is (= #{worktree-row-id} (visible-ids worktree-scope model ids))))
                (testing "default worktree reads its own rows and not worktree's"
                  (is (= #{main-id} (visible-ids mdb/default-worktree-scope model ids))))
                (testing "other worktree reads neither"
                  (is (= #{} (visible-ids other-worktree-scope model ids))))
                (testing "scope of every worktree reads both"
                  (is (= (set ids) (visible-ids {:type :all} model ids))))))))))))

(deftest same-entity-id-in-main-app-and-worktree-test
  (when config/ee-available?
    (let [entity-id "worktreetestentityid1"]
      (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id}  {:branch "test-branch"}
                     :model/Card               {main-card-id :id} {:entity_id entity-id}]
        (mdb/with-worktree-scope {:type :worktree :worktree-id worktree-id}
          (mt/with-temp [:model/Card {card-id :id} {:entity_id entity-id}]
            (testing "worktree copy is its own row"
              (is (not= main-card-id card-id)))
            (testing "entity id names worktree copy in worktree"
              (is (= card-id (t2/select-one-pk :model/Card :entity_id entity-id))))
            (testing "entity id names default worktree row in default worktree"
              (is (= main-card-id (mdb/with-worktree-scope mdb/default-worktree-scope
                                    (t2/select-one-pk :model/Card :entity_id entity-id)))))))))))
