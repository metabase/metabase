(ns metabase.app-db.worktree-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.worktree :as mdb.worktree]
   [metabase.config.core :as config]
   [metabase.models.resolution :as models.resolution]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection DatabaseMetaData ResultSet)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private synced-table-allowlist
  "The models of synced content tables without `worktree_id` or the hook; a synced table without the scope is a bug unless remote
  sync never syncs it per worktree, so this is expected to stay empty."
  #{})

(def ^:private referencing-table-allowlist
  "The models of tables reaching synced content through foreign keys without `worktree_id` and the hook; scope such a table unless a
  decision keeps it instance-wide."
  #{;; Metabot tables stay unscoped; its card_id references report_card.
    :model/MetabotPrompt
    ;; Metabot tables stay unscoped; collection_id references collection.
    :model/Metabot
    ;; tenants aren't scoped yet; tenant_collection_id references collection
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
    ;; They are source replacement records keyed by entity ids.
    :model/SourceDimensionDaily
    :model/SourceDimensionProfileDaily
    :model/SourceMetricDaily
    :model/ReplacementRun
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
    :model/WorkspaceDatabase
    ;; Keyed by the workspace that a request names, which is not a worktree.
    :model/WorkspaceFieldCopy
    :model/WorkspaceTableCopy})

(def ^:private worktree-reference-tables
  "The models of other tables, with `worktree_id` but without the hook, since the column names a worktree rather than
  scoping the row."
  #{;; Its worktree_id is the user's checked-out worktree.
    :model/RemoteSyncWorktreeUser})

(defn- result-rows
  "The rows of the JDBC result set `rs`, each the map that `f` makes of it."
  [^ResultSet rs f]
  (with-open [rs rs]
    (loop [acc []]
      (if (.next rs)
        (recur (conj acc (f rs)))
        acc))))

(defn- lower-name
  "The lower-cased string `s` from the database metadata."
  [s]
  (u/lower-case-en s))

(defn- partition?
  "Whether `table` is a Postgres partition of another of `tables`, named `<parent>_YYYY_MM`."
  [tables table]
  (boolean (when-let [[_ parent] (re-matches #"(.+)_\d{4}_\d{2}" table)]
             (contains? tables parent))))

(defn- grouped-rows
  "The rows of the JDBC result set `rs` grouped by the string column `group-column`, each group the vector of the maps
  that `f` makes of its rows, in the order of the integer column `order-column`."
  [^ResultSet rs group-column order-column f]
  (update-vals (group-by first (result-rows rs (fn [^ResultSet rs]
                                                 [(.getString rs ^String group-column)
                                                  (.getInt rs ^String order-column)
                                                  (f rs)])))
               #(mapv last (sort-by second %))))

(defn- table-schema
  "The columns of `table`, its non-null columns, its unique keys as column sets and its foreign keys as
  `{:columns [...] :parent table}` maps, read from `md`."
  [^DatabaseMetaData md catalog schema table]
  (let [columns (result-rows (.getColumns md catalog schema table "%")
                             (fn [^ResultSet rs]
                               [(lower-name (.getString rs "COLUMN_NAME")) (= "NO" (.getString rs "IS_NULLABLE"))]))]
    {:columns     (into #{} (map first) columns)
     :not-null    (into #{} (keep (fn [[column not-null?]] (when not-null? column))) columns)
     :unique-keys (into #{}
                        (comp (map #(into #{} (keep identity) %)) (filter seq))
                        (vals (dissoc (grouped-rows (.getIndexInfo md catalog schema table true true)
                                                    "INDEX_NAME" "ORDINAL_POSITION"
                                                    #(some-> (.getString ^ResultSet % "COLUMN_NAME") lower-name))
                                      nil)))
     :foreign-keys (into []
                         (map (fn [rows] {:columns (mapv first rows) :parent (second (first rows))}))
                         (vals (grouped-rows (.getImportedKeys md catalog schema table) "FK_NAME" "KEY_SEQ"
                                             (fn [^ResultSet rs]
                                               [(lower-name (.getString rs "FKCOLUMN_NAME"))
                                                (lower-name (.getString rs "PKTABLE_NAME"))]))))}))

(defn- app-db-schema
  "The base tables of the app DB but the Postgres partitions and the search index tables that search creates at run
  time, each the lower-cased name of a table mapped to its [[table-schema]] and its foreign keys as
  `[column parent-table]` pairs under `:fks`."
  []
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)
          catalog              (.getCatalog conn)
          schema               (.getSchema conn)
          tables               (result-rows (.getTables md catalog schema "%" (into-array String ["TABLE" "PARTITIONED TABLE"]))
                                            #(.getString ^ResultSet % "TABLE_NAME"))]
      (into {}
            (for [table tables
                  :let  [lower (lower-name table)]
                  :when (not (or (str/starts-with? lower "search_index__")
                                 (partition? (set (map lower-name tables)) lower)))
                  :let  [table-info (table-schema md catalog schema table)]]
              [lower (assoc table-info :fks (for [{:keys [columns parent]} (:foreign-keys table-info)
                                                  column                   columns]
                                              [column parent]))])))))

(defn- model-table
  "The lower-cased table of `model`."
  [model]
  (lower-name (name (t2/table-name model))))

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

(defn- worktree-tables
  "The tables of `schema` with a `worktree_id` column."
  [schema]
  (into #{} (keep (fn [[table {:keys [columns]}]] (when (contains? columns "worktree_id") table))) schema))

(defn- decision
  "The decision the app DB and the models make for `table`: `:scoped`, `:unscoped` or `:worktree-reference`, or the
  pair of facts that match none of them."
  [schema hooked table]
  (let [column? (contains? (worktree-tables schema) table)
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
      (let [schema (app-db-schema)
            roots  (set/difference (set/intersection (content-roots) (set (keys schema)))
                                   (tables-of synced-table-allowlist))
            bad    (mismatches schema (hooked-tables) roots (constantly :scoped) {})]
        (is (empty? bad) (str "Synced content tables that are not scoped:\n" (str/join "\n" bad)))))))

(deftest tables-referencing-synced-content-are-scoped-test
  (when config/ee-available?
    (models.resolution/load-all-models!)
    (testing "every table reaching synced content through foreign keys has worktree_id and the hook"
      (let [schema (app-db-schema)
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
      (let [schema    (app-db-schema)
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

(defn- worktree-id-default
  "The default of the `worktree_id` column of `table`, as the app DB reports it."
  [table]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (first (for [t     [table (u/upper-case-en table)]
                   c     ["worktree_id" "WORKTREE_ID"]
                   value (result-rows (.getColumns md (.getCatalog conn) (.getSchema conn) t c)
                                      #(.getString ^ResultSet % "COLUMN_DEF"))]
               value)))))

(deftest default-worktree-is-default-worktree-id-test
  (testing "app DB holds exactly one default worktree, whose id is default-worktree-id"
    (is (= [mdb/default-worktree-id]
           (t2/select-fn-vec :id :remote_sync_worktree :is_default true))))
  (testing "worktree_id columns default to default-worktree-id"
    (is (= (str mdb/default-worktree-id)
           (some-> (worktree-id-default "collection") (str/replace #"[^0-9]" ""))))))

(defn- relation-columns
  "The lower-cased column names of the table or view `relation`, as the app DB reports them."
  [relation]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (into #{}
            (mapcat (fn [r]
                      (result-rows (.getColumns md (.getCatalog conn) (.getSchema conn) r "%")
                                   #(lower-name (.getString ^ResultSet % "COLUMN_NAME")))))
            [relation (u/upper-case-en relation)]))))

(deftest worktree-views-have-table-columns-test
  (doseq [[table view] @#'mdb.worktree/view-substitutions]
    (testing (str (name view) " has the columns of " (name table) " and worktree_id")
      (is (= (conj (relation-columns (name table)) "worktree_id")
             (relation-columns (name view)))))))

(def ^:private unique-key-allowlist
  "The models of tables with `worktree_id` whose unique keys may leave it out; add one only when a row is unique
  across every worktree."
  #{;; A user has one checkout, whichever worktree it is in.
    :model/RemoteSyncWorktreeUser})

(defn- primary-key
  "The column set of the primary key of `table`."
  [table]
  (t2/with-connection [^Connection conn]
    (let [^DatabaseMetaData md (.getMetaData conn)]
      (into #{}
            (mapcat (fn [t]
                      (result-rows (.getPrimaryKeys md (.getCatalog conn) (.getSchema conn) t)
                                   #(lower-name (.getString ^ResultSet % "COLUMN_NAME")))))
            [table (u/upper-case-en table)]))))

(deftest worktree-unique-keys-include-worktree-id-test
  (when config/ee-available?
    (models.resolution/load-all-models!)
    (testing "every unique key but the primary key of a table with worktree_id includes worktree_id"
      (let [schema (app-db-schema)
            bad    (for [table      (sort (set/difference (worktree-tables schema) (tables-of unique-key-allowlist)))
                         :let       [pk (primary-key table)]
                         unique-key (get-in schema [table :unique-keys])
                         :when      (and (not= pk unique-key)
                                         (not (contains? unique-key "worktree_id")))]
                     (format "%s: %s" table (str/join ", " (sort unique-key))))]
        (is (empty? bad) (str "Unique keys without worktree_id:\n" (str/join "\n" bad)))))))

(deftest worktree-foreign-keys-are-composite-test
  (testing "a non-null foreign key between two tables with worktree_id has a composite one with worktree_id first"
    (let [schema    (app-db-schema)
          worktree? (worktree-tables schema)
          bad       (for [table                  (sort worktree?)
                          :let                   [{:keys [foreign-keys not-null]} (schema table)]
                          {[column] :columns
                           :keys    [columns parent]} foreign-keys
                          :when                  (and (= 1 (count columns))
                                                      (not= "worktree_id" column)
                                                      (not= table parent)
                                                      (worktree? parent)
                                                      (contains? not-null column)
                                                      (not (some #(= {:columns ["worktree_id" column] :parent parent} %)
                                                                 foreign-keys)))]
                      (format "%s.%s -> %s" table column parent))]
      (is (empty? bad) (str "Non-null foreign keys without a composite one:\n" (str/join "\n" bad))))))

(defn- generated-constraint-names
  "The `table.constraint` names of the H2 constraints that H2 named itself, but those of the Liquibase tables and the
  search index tables that search creates at run time."
  []
  (t2/with-connection [^Connection conn]
    (with-open [statement (.createStatement conn)]
      (result-rows (.executeQuery statement (str "SELECT TABLE_NAME, CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                                                 "WHERE CONSTRAINT_SCHEMA = 'PUBLIC' "
                                                 "AND REGEXP_LIKE(CONSTRAINT_NAME, '^CONSTRAINT_[0-9A-F]+$') "
                                                 "AND TABLE_NAME NOT LIKE 'DATABASECHANGELOG%' "
                                                 "AND NOT REGEXP_LIKE(TABLE_NAME, '^SEARCH_INDEX__') ORDER BY 1, 2"))
                   (fn [^ResultSet rs]
                     (str (lower-name (.getString rs 1)) "." (.getString rs 2)))))))

(deftest constraints-are-named-test
  (when (= :h2 (mdb/db-type))
    (testing "every constraint has a name, since a changeset can name a generated one only through a lookup"
      (let [bad (generated-constraint-names)]
        (is (empty? bad) (str "Constraints with generated names:\n" (str/join "\n" bad)))))))
