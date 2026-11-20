(ns metabase-enterprise.remote-sync.write-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.write :as remote-sync.write]
   [metabase.app-db.core :as mdb]
   [metabase.models.resolution :as models.resolution]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- tables-with-worktree-id
  "The tables of the current schema, partitions aside, with a worktree_id column."
  []
  (into #{} (map :relname)
        (t2/query {:select [:c.relname]
                   :from   [[:pg_attribute :a]]
                   :join   [[:pg_class :c] [:= :c.oid :a.attrelid]
                            [:pg_namespace :n] [:= :n.oid :c.relnamespace]]
                   :where  [:and
                            [:= :a.attname "worktree_id"]
                            [:not :a.attisdropped]
                            [:in :c.relkind ["r" "p"]]
                            [:not :c.relispartition]
                            [:= :n.nspname [:current_schema]]]})))

(defn- tables-with-worktree-policy
  "The tables of the current schema with the worktree row-level security policy."
  []
  (into #{} (map :tablename)
        (t2/query {:select [:tablename]
                   :from   [:pg_policies]
                   :where  [:and [:= :policyname "worktree"] [:= :schemaname [:current_schema]]]})))

(def ^:private unrelated-columns
  "The columns, by table, that reference users, sessions, tenants, external systems, warehouse metadata or rows that
  stay in the main app, and so don't make the rows of a table without a worktree_id column belong to worktrees."
  {"agent_api_call_log"             #{"user_id" "tenant_id"}
   "ai_usage_log"                   #{"user_id" "tenant_id" "conversation_id" "profile_id" "request_id"}
   "api_key_usage_log"              #{"api_key_id" "user_id" "created_by_id"}
   "auth_identity"                  #{"provider_id"}
   "cache_config"                   #{"model_id"}
   "change_log"                     #{"row_id"}
   "cloud_migration"                #{"external_id"}
   "core_session"                   #{"saml_name_id" "mfa_auth_identity_id"}
   "data_edit_undo_chain"           #{"table_id" "user_id"}
   "login_history"                  #{"device_id"}
   "mcp_feedback"                   #{"user_id"}
   "mcp_query_handle"               #{"mcp_session_id"}
   "mcp_session_log"                #{"user_id" "tenant_id"}
   "mcp_tool_call_log"              #{"user_id" "tenant_id"}
   "metabase_table"                 #{"owner_user_id" "collection_id" "transform_id"}
   "metabot"                        #{"collection_id"}
   "metabot_conversation"           #{"slack_team_id" "slack_channel_id"}
   "metabot_feedback"               #{"user_id"}
   "metabot_message"                #{"profile_id" "slack_msg_id" "channel_id" "deleted_by_user_id" "user_id"
                                      "external_id" "forked_from_message_id"}
   "metabot_source_feedback"        #{"user_id" "source_id"}
   "notification"                   #{"internal_id" "payload_id"}
   "notification_card"              #{"card_id"}
   "oauth_access_token"             #{"client_id"}
   "oauth_authorization_code"       #{"client_id"}
   "oauth_client"                   #{"client_id"}
   "oauth_refresh_token"            #{"client_id"}
   "osi_ai_context"                 #{"entity_local_id"}
   "permissions"                    #{"collection_id"}
   "pulse_channel"                  #{"pulse_id"}
   "sandboxes"                      #{"card_id"}
   "security_advisory"              #{"advisory_id"}
   "source_dimension_daily"         #{"source_id" "field_id"}
   "source_dimension_profile_daily" #{"source_id" "field_id"}
   "source_metric_daily"            #{"source_id" "agg_field_id" "temporal_field_id"}
   "source_replacement_run"         #{"source_entity_id" "target_entity_id"}
   "source_segment_composite_daily" #{"source_id"}
   "source_segment_daily"           #{"source_id" "field_id"}
   "task_history"                   #{"db_id"}
   "task_run"                       #{"entity_id" "notification_id"}
   "tenant"                         #{"tenant_collection_id"}
   "transform_job_run"              #{"job_id" "job_entity_id"}
   "transform_run_cancelation"      #{"run_id"}})

(defn- model-tables
  "The tables of the models, by name, with whether their models give each row an entity id of its own."
  []
  (reduce (fn [acc model]
            (update acc (name (t2/table-name model)) #(or % (isa? model :hook/entity-id))))
          {}
          (keys models.resolution/model->namespace)))

(defn- reference-columns
  "The columns of the tables of the current schema that are foreign keys, with the tables they reference, or that end
  in _id without being one."
  []
  (let [foreign-keys (into {}
                           (map (juxt (juxt :table :column) :referenced))
                           (t2/query {:select [[:u.table_name :table] [:u.column_name :column] [:r.table_name :referenced]]
                                      :from   [[:information_schema.table_constraints :k]]
                                      :join   [[:information_schema.key_column_usage :u]
                                               [:and
                                                [:= :u.constraint_schema :k.constraint_schema]
                                                [:= :u.constraint_name :k.constraint_name]]
                                               [:information_schema.constraint_column_usage :r]
                                               [:and
                                                [:= :r.constraint_schema :k.constraint_schema]
                                                [:= :r.constraint_name :k.constraint_name]]]
                                      :where  [:and
                                               [:= :k.constraint_type "FOREIGN KEY"]
                                               [:= :k.table_schema [:current_schema]]]}))]
    (for [{:keys [table column]} (t2/query {:select [[:c.relname :table] [:a.attname :column]]
                                            :from   [[:pg_attribute :a]]
                                            :join   [[:pg_class :c] [:= :c.oid :a.attrelid]
                                                     [:pg_namespace :n] [:= :n.oid :c.relnamespace]]
                                            :where  [:and
                                                     [:> :a.attnum 0]
                                                     [:not :a.attisdropped]
                                                     [:in :c.relkind ["r" "p"]]
                                                     [:not :c.relispartition]
                                                     [:= :n.nspname [:current_schema]]]})
          :let  [referenced (get foreign-keys [table column])]
          :when (or referenced (str/ends-with? column "_id"))]
      {:table table :column column :referenced referenced})))

(defn- tables-of-worktree-rows
  "The tables whose rows belong to worktrees: those of the models remote sync syncs and of its tasks, those with a
  column ending in _id that is no foreign key, which may reference synced rows, and, transitively, those with a
  foreign key to any of them, leaving out the worktree_id columns, the entity ids rows have of their own and
  `unrelated-columns`."
  []
  (let [model-tables (model-tables)
        references   (for [{:keys [table column] :as reference} (reference-columns)
                           :when (and (contains? model-tables table)
                                      (not= "worktree_id" column)
                                      (not (and (= "entity_id" column) (model-tables table)))
                                      (not (contains? (unrelated-columns table) column)))]
                       reference)
        referencing  (group-by :referenced (filter :referenced references))]
    (loop [found   #{}
           pending (concat ["remote_sync_task"]
                           (map (comp name t2/table-name) (remote-sync/synced-models))
                           (keep #(when-not (:referenced %) (:table %)) references))]
      (if-let [[table & more] (seq pending)]
        (if (contains? found table)
          (recur found more)
          (recur (conj found table) (concat more (map :table (referencing table)))))
        found))))

(deftest worktree-tables-test
  (when (= :postgres (mdb/db-type))
    (models.resolution/load-all-models!)
    (let [worktree-tables (set (remote-sync.db/worktree-tables))]
      (testing "the tables with a worktree_id column, the users' aside, are those of the models deriving :hook/worktree-id"
        (is (= (disj (tables-with-worktree-id) "core_user") worktree-tables)))
      (testing "and each has the worktree policy"
        (is (= worktree-tables (tables-with-worktree-policy))))
      (testing "they are the tables of synced rows and those that reference them, by foreign key or by another _id column"
        (is (= (tables-of-worktree-rows) worktree-tables)))
      (testing "dependency references synced rows by from_entity_id and to_entity_id, no foreign keys"
        (is (contains? (tables-of-worktree-rows) "dependency"))))))

(deftest row-level-security-follows-worktrees-test
  (when (= :postgres (mdb/db-type))
    (let [worktree-tables (set (remote-sync.db/worktree-tables))]
      (testing "row-level security is off while no worktree exists"
        (is (= #{} (remote-sync.db/row-level-security-tables))))
      (let [first-id  (:id (remote-sync.write/create-worktree! {:branch "first"}))
            second-id (:id (remote-sync.write/create-worktree! {:branch "second"}))]
        (try
          (testing "the first worktree turns it on for the tables of worktree rows"
            (is (= worktree-tables (remote-sync.db/row-level-security-tables))))
          (remote-sync.write/delete-worktree! first-id)
          (testing "it stays on while a worktree remains"
            (is (= worktree-tables (remote-sync.db/row-level-security-tables))))
          (testing "the main app still reads its rows"
            (mt/with-temp [:model/Collection {coll-id :id} {:name "Main"}]
              (is (t2/exists? :model/Collection :id coll-id))))
          (remote-sync.write/delete-worktree! second-id)
          (testing "deleting the last worktree turns it off"
            (is (= #{} (remote-sync.db/row-level-security-tables))))
          (finally
            (run! remote-sync.write/delete-worktree! [first-id second-id])))))))
