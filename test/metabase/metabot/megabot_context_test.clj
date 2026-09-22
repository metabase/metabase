(ns metabase.metabot.megabot-context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.megabot-context :as megabot-context]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest app-db-map-matches-live-schema-test
  (mt/initialize-if-needed! :db)
  (testing "every table and column the curated app-db map names exists in the live app-db schema"
    ;; a migration that renames/drops something the map describes must update the map, or the agent is
    ;; primed with a schema that no longer exists
    (let [schema (metabot.db/app-db-schema)]
      (is (< 100 (count schema)) "the live schema was read")
      (doseq [domain (:domains @megabot-context/app-db-map)
              {:keys [table columns]} (:tables domain)]
        (testing table
          (if-let [live (get schema table)]
            (let [live-columns (set (map :name (:columns live)))]
              (doseq [[column _note] columns]
                (is (contains? live-columns column)
                    (str table "." column " is in the curated map but not in the app db"))))
            (is false (str table " is in the curated map but not in the app db"))))))))

(deftest app-db-schema-test
  (mt/initialize-if-needed! :db)
  (let [schema (metabot.db/app-db-schema)]
    (testing "names are lower-cased and framework tables are left out"
      (is (every? #(= % (u/lower-case-en %)) (keys schema)))
      (is (not-any? #(or (str/starts-with? % "qrtz_") (str/starts-with? % "databasechangelog")) (keys schema))))
    (testing "columns, foreign keys, and views are reported"
      (is (some #{"dataset_query"} (map :name (get-in schema ["report_card" :columns]))))
      (is (= "metabase_database.id" (get-in schema ["metabase_table" :fks "db_id"])))
      (is (true? (get-in schema ["v_content" :view?]))))))

(deftest render-app-db-map-test
  (let [rendered (megabot-context/render-app-db-map)]
    (testing "renders tables with their column notes, routing, and gotchas"
      (is (str/includes? rendered "## Metabase application database"))
      (is (str/includes? rendered "- **report_card** — "))
      (is (str/includes? rendered "type (question | model | metric)"))
      (is (str/includes? rendered "### Where to find what"))
      (is (str/includes? rendered "### Gotchas")))
    (testing "stays small enough to always sit in the system prompt (~8K tokens at most)"
      (is (< (count rendered) 32000)))))

(deftest app-db-map-avoids-unmaintained-tables-test
  (testing "no curated table or routing answer points the agent at a table nothing keeps up to date"
    (let [{:keys [unmaintained domains routing]} @megabot-context/app-db-map
          curated (set (for [domain domains, table (:tables domain)] (:table table)))]
      (is (seq unmaintained))
      (doseq [table-name (keys unmaintained)]
        (testing table-name
          (is (not (contains? curated table-name)))
          (doseq [[question where] routing]
            (is (not (re-find (re-pattern (str "\\b" table-name "\\b")) where))
                (str "routing for \"" question "\" mentions " table-name))))))))

(deftest instance-snapshot-test
  (mt/with-temp [:model/Database {db-id :id}     {:name "Snapshot Warehouse" :engine :postgres}
                 :model/Table    {people-id :id} {:db_id db-id :schema "sales" :name "people" :active true}
                 :model/Table    {orders-id :id} {:db_id db-id :schema "sales" :name "orders" :active true}
                 :model/Table    _               {:db_id db-id :schema "sales" :name "dropped" :active false}
                 :model/Field    {person-pk :id} {:table_id people-id :name "id" :base_type :type/Integer
                                                  :semantic_type :type/PK}
                 :model/Field    {person-fk :id} {:table_id orders-id :name "person_id" :base_type :type/Integer
                                                  :semantic_type :type/FK :fk_target_field_id person-pk}
                 :model/Field    {total-id :id}  {:table_id orders-id :name "total" :base_type :type/Float}
                 :model/Database {empty-id :id}  {:name "Empty Warehouse" :engine :postgres}
                 :model/Database {stub-id :id}   {:name "Stub Warehouse" :engine :postgres :is_stub true}
                 :model/Table    _               {:db_id stub-id :schema "s" :name "t" :active true}
                 :model/Database {dest-id :id}   {:name "Destination Warehouse" :engine :postgres
                                                  :router_database_id db-id}
                 :model/Card     {model-id :id}  {:name "Snapshot Model" :type :model :database_id db-id
                                                  :description "Clean orders,\n one row each"}
                 :model/Card     _               {:name "Snapshot Archived Metric" :type :metric :archived true}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [snapshot (megabot-context/instance-snapshot)]
        (testing "lists the app-db dialect"
          (is (str/includes? snapshot "App database dialect: ")))
        (testing "names the user's personal collection as the default place for new content"
          (let [{:keys [id] collection-name :name} (collection/user->personal-collection (mt/user->id :crowberto))]
            (is (str/includes? snapshot (str "Your personal collection: " collection-name " (id " id ")")))))
        (testing "lists each queryable database with its id and its active tables"
          (is (str/includes? snapshot (str "**Snapshot Warehouse** — id " db-id ", postgres, 2 tables")))
          (is (str/includes? snapshot (str "- " people-id " sales.people")))
          (is (not (str/includes? snapshot "sales.dropped"))))
        (testing "inlines columns on a small instance, with the field ids structured queries take, PKs, and resolved FKs"
          (is (str/includes? snapshot (str "- " people-id " sales.people: id #" person-pk " (PK)")))
          (is (str/includes? snapshot (str "- " orders-id " sales.orders: person_id #" person-fk " → sales.people.id, "
                                           "total #" total-id))))
        (testing "an admin may write SQL everywhere, so no database is marked structured-only"
          (is (not (str/includes? snapshot "structured queries only")))
          (is (not (str/includes? snapshot "You can't write SQL"))))
        (testing "leaves out databases the agent can't usefully query"
          (is (not (str/includes? snapshot (str "id " empty-id ","))) "no queryable tables")
          (is (not (str/includes? snapshot "Stub Warehouse")) "deserialization placeholder")
          (is (not (str/includes? snapshot "Destination Warehouse")) "router destination")
          ;; a destination can't carry tables in a with-temp (no perms may be granted on it), so check the source
          ;; query directly rather than relying on the no-queryable-tables filter
          (is (not-any? #{dest-id stub-id} (map :id (metabot.db/queryable-warehouse-databases)))))
        (testing "lists visible, non-archived metrics and models with one-line descriptions"
          (is (str/includes? snapshot (str "- model " model-id ": Snapshot Model (database " db-id ") — Clean orders, one row each")))
          (is (not (str/includes? snapshot "Snapshot Archived Metric"))))
        (testing "no longer reports misleading content counts"
          (is (not (str/includes? snapshot "collections"))))))
    (testing "a user without data access sees none of the databases"
      (mt/with-no-data-perms-for-all-users!
        (mt/with-current-user (mt/user->id :rasta)
          (is (not (str/includes? (megabot-context/instance-snapshot) "Snapshot Warehouse"))))))
    (testing "a database the user can query but not write SQL against is listed, marked structured-only"
      (mt/with-no-data-perms-for-all-users!
        (doseq [id [(mt/id) db-id]]
          (perms/set-database-permission! (perms-group/all-users) id :perms/view-data :unrestricted))
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
        (perms/set-database-permission! (perms-group/all-users) db-id :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (let [snapshot (megabot-context/instance-snapshot)]
            (is (str/includes? snapshot (str "**Snapshot Warehouse** — id " db-id ", postgres, 2 tables, "
                                             "structured queries only (no SQL permission)")))
            (is (str/includes? snapshot (str "- " orders-id " sales.orders")))
            (is (re-find (re-pattern (str "— id " (mt/id) ", h2, \\d+ tables\n")) snapshot)
                "the database with SQL permission carries no marker")
            (is (not (str/includes? snapshot "You can't write SQL")))))))))

(deftest instance-snapshot-metric-sources-test
  (testing "each metric is listed with the source it works on: its table, or the model it's built on"
    (mt/with-temp [:model/Card {model-id :id}  {:name          "Snapshot Orders Model"
                                                :type          :model
                                                :view_count    1000000
                                                :dataset_query (lib/query (mt/metadata-provider)
                                                                          (lib.metadata/table (mt/metadata-provider)
                                                                                              (mt/id :orders)))}
                   :model/Card {revenue-id :id} {:name          "Snapshot Revenue"
                                                 :type          :metric
                                                 :view_count    1000000
                                                 :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                               (lib.metadata/table (mt/metadata-provider)
                                                                                                   (mt/id :orders)))
                                                                    (lib/aggregate
                                                                     (lib/sum (lib.metadata/field (mt/metadata-provider)
                                                                                                  (mt/id :orders :total)))))}
                   :model/Card {count-id :id}   {:name          "Snapshot Model Count"
                                                 :type          :metric
                                                 :view_count    1000000
                                                 :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                               (lib.metadata/card (mt/metadata-provider)
                                                                                                  model-id))
                                                                    (lib/aggregate (lib/count)))}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [snapshot (megabot-context/instance-snapshot)]
          (is (str/includes? snapshot (str "- metric " revenue-id ": Snapshot Revenue (database " (mt/id)
                                           ", source-table " (mt/id :orders) " PUBLIC.ORDERS)")))
          (is (str/includes? snapshot (str "- metric " count-id ": Snapshot Model Count (database " (mt/id)
                                           ", source-card " model-id ")")))
          (is (str/includes? snapshot (str "- model " model-id ": Snapshot Orders Model (database " (mt/id) ")")))
          (testing "with the recipe for using them in a structured query"
            (is (str/includes? snapshot "use a metric as `[\"metric\", {}, <metric id>]` in `aggregation`"))
            (is (str/includes? snapshot "query a model with `\"source-card\": <model id>`"))))))))

(deftest megabot-system-context-test
  (testing "the profile hook supplies the static map, the live snapshot, and the notes catalog"
    (let [ctx (mt/with-current-user (mt/user->id :crowberto)
                (megabot-context/megabot-system-context {}))]
      (is (str/includes? (:megabot_app_db_map ctx) "## Metabase application database"))
      (is (str/includes? (:megabot_instance ctx) "## This instance"))
      (is (contains? ctx :megabot_notes))
      (is (contains? ctx :megabot_notes_more)))))
