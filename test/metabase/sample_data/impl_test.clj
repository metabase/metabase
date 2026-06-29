(ns metabase.sample-data.impl-test
  "Tests to make sure the Sample Database syncs the way we would expect."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.permissions.core :as perms]
   [metabase.plugins.impl :as plugins]
   [metabase.sample-data.example-content :as example-content]
   [metabase.sample-data.impl :as sample-data]
   [metabase.sync.core :as sync]
   [metabase.sync.task.sync-databases-test :as task.sync-databases-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [metabase.warehouses-rest.api-test :as api.database-test]
   [toucan2.core :as t2])
  (:import (org.sqlite SQLiteException)))

;;; ---------------------------------------------------- Tooling -----------------------------------------------------

;; These tools are pretty sophisticated for the amount of tests we have!

(defn- sample-database-db
  "Sample DB is SQLite-backed and always read-only: `try-to-extract-sample-database!` returns details with
  `:read-only? true`, which the SQLite driver honors by opening the connection in read-only `open_mode`."
  []
  {:details (#'sample-data/try-to-extract-sample-database! :sqlite)
   :engine  :sqlite
   :name    "Sample Database"})

(defmacro ^:private with-temp-sample-database-db
  "Execute `body` with a temporary Sample Database DB bound to `db-binding`."
  {:style/indent 1}
  [[db-binding] & body]
  `(mt/with-temp [:model/Database db# (sample-database-db)]
     (sync/sync-database! db#)
     (let [~db-binding db#]
       ~@body)))

(defn- table
  "Get the Table in a `db` with `table-name`."
  [db table-name]
  (t2/select-one :model/Table :name table-name, :db_id (u/the-id db)))

(defn- field
  "Get the Field in a `db` with `table-name` and `field-name.`"
  [db table-name field-name]
  (t2/select-one :model/Field :name field-name, :table_id (u/the-id (table db table-name))))

;;; ----------------------------------------------------- Tests ------------------------------------------------------

(def ^:private extracted-db-path-regex #".*plugins/sample-database\.sqlite$")

(deftest extract-sample-database-test
  (testing "The Sample Database is copied out of the JAR into the plugins directory before the DB details are saved."
    (mt/with-dynamic-fn-redefs [sync/sync-database! (constantly nil)]
      (with-temp-sample-database-db [db]
        (let [db-path (get-in db [:details :db])]
          (is (re-matches extracted-db-path-regex db-path))))))
  (memoize/memo-clear! @#'plugins/plugins-dir*))

(deftest sync-sample-database-test
  (testing "Make sure the Sample Database is getting synced correctly."
    (with-temp-sample-database-db [db]
      ;; Manually activate Field values since they are not created during sync (#53387)
      (field-values/get-or-create-full-field-values! (field db "PEOPLE" "NAME"))
      (is (= {:description      "The name of the user who owns an account"
              :database_type    "CHARACTER VARYING"
              :semantic_type    :type/Name
              :name             "NAME"
              :has_field_values :list
              :active           true
              :visibility_type  :normal
              :preview_display  true
              :display_name     "Name"
              :fingerprint      {:global {:distinct-count 2499
                                          :nil%           0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 13.532
                                                      :mode-fraction  4.0E-4
                                                      :top-3-fraction 0.0012
                                                      :percent-blank  0.0}}}
              :base_type        :type/Text}
             (-> (field db "PEOPLE" "NAME")
                 ;; it should be `nil` after sync but get set to `search` by the auto-inference. We only set `list` in
                 ;; sync and setting anything else is reserved for admins, however we fill in what we think should be
                 ;; the appropiate value with the hydration fn
                 (t2/hydrate :has_field_values)
                 (select-keys [:name :description :database_type :semantic_type :has_field_values :active :visibility_type
                               :preview_display :display_name :fingerprint :base_type])))))))

(deftest sample-database-is-read-only-test
  (testing "The Sample Database connection is read-only: reads succeed but INSERT/UPDATE/DELETE are rejected"
    (mt/with-temp [:model/Database db (sample-database-db)]
      (sync/sync-database! db)
      (mt/with-db db
        (let [conn-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
          (testing "reads succeed"
            (is (= [2]
                   (->> (jdbc/query conn-spec "SELECT QUANTITY FROM ORDERS WHERE ID = 1;")
                        (map :quantity)))))
          (testing "writes are rejected because the connection is read-only"
            (doseq [[op sql] [["UPDATE" "UPDATE ORDERS SET QUANTITY = 1 WHERE ID = 1;"]
                              ["INSERT" "INSERT INTO PRODUCTS (price, rating) VALUES (12.345, 6.789);"]
                              ["DELETE" "DELETE FROM PRODUCTS WHERE PRICE = 12.345;"]]]
              (testing op
                (is (thrown-with-msg?
                     SQLiteException
                     #"(?i)readonly"
                     (jdbc/execute! conn-spec sql)))))))))))

(deftest update-sample-database-same-engine-test
  (testing "When the bundled engine is unchanged, the sample DB is kept and only its details refreshed"
    (mt/with-temp [:model/Database db (assoc (sample-database-db)
                                             :is_sample true
                                             :details {:db "/stale/path/sample-database.sqlite"})]
      (let [extract-called? (atom false)]
        (mt/with-dynamic-fn-redefs [sample-data/extract-and-sync-sample-database! (fn [] (reset! extract-called? true))]
          (#'sample-data/update-sample-database-if-needed! db))
        (testing "the existing sample DB row is not replaced"
          (is (false? @extract-called?))
          (is (t2/exists? :model/Database :id (:id db))))
        (testing "its details were refreshed to the intended path"
          (is (re-matches extracted-db-path-regex
                          (get-in (t2/select-one :model/Database :id (:id db)) [:details :db]))))))))

(deftest replace-sample-database-on-engine-change-test
  (testing "When the bundled engine changed (H2 -> SQLite), the old sample DB and its dependent content are removed"
    (mt/with-temp
      [:model/Database  old-sample  {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}
       :model/Database  other-db    {:engine :h2, :details {:db "mem:other"}}
       :model/Card      sample-card {:database_id (:id old-sample)}
       :model/Card      other-card  {:database_id (:id other-db)}
       :model/Dashboard sample-dash {}
       :model/Dashboard mixed-dash  {}
       :model/DashboardCard _ {:dashboard_id (:id sample-dash), :card_id (:id sample-card)}
       :model/DashboardCard _ {:dashboard_id (:id mixed-dash),  :card_id (:id sample-card)}
       :model/DashboardCard _ {:dashboard_id (:id mixed-dash),  :card_id (:id other-card)}
       :model/Collection examples  {:name "Examples",   :is_sample true}
       :model/Collection ecommerce {:name "E-commerce", :is_sample true, :location (str "/" (:id examples) "/")}
       :model/Collection keep-coll {:name "Keep me"}]
      (let [bundled-engine (#'sample-data/sample-database-engine)
            synced-db-ids  (atom [])]
        ;; recreate (collection reuse) is exercised separately; here we only check the database swap + cleanup.
        (with-redefs [example-content/recreate-example-content! (constantly nil)]
          (mt/with-dynamic-fn-redefs [sync/sync-database! (fn [db] (swap! synced-db-ids conj (:id db)) db)]
            (#'sample-data/update-sample-database-if-needed! old-sample)))
        (testing "the old sample DB is deleted, cascading to its cards"
          (is (not (t2/exists? :model/Database :id (:id old-sample))))
          (is (not (t2/exists? :model/Card :id (:id sample-card)))))
        (testing "a dashboard emptied by the deletion is deleted"
          (is (not (t2/exists? :model/Dashboard :id (:id sample-dash)))))
        (testing "a dashboard that still has other cards is kept"
          (is (t2/exists? :model/Dashboard :id (:id mixed-dash)))
          (is (t2/exists? :model/Card :id (:id other-card))))
        (testing "the Example collections are preserved (reused on recreate), not deleted by the engine swap"
          (is (t2/exists? :model/Collection :id (:id examples)))
          (is (t2/exists? :model/Collection :id (:id ecommerce)))
          (is (t2/exists? :model/Collection :id (:id keep-coll))))
        (testing "a new sample database with the bundled engine is created and synced"
          ;; replace-sample-database! inserts the new sample DB outside any with-temp, so key off the synced id
          ;; (authoritative) rather than (select-one :is_sample true), which would see leaks from other tests.
          (is (= 1 (count @synced-db-ids)) "the new database (not the old one) is what gets synced")
          (let [new-db (t2/select-one :model/Database :id (first @synced-db-ids))]
            (is (some? new-db))
            (is (not= (:id old-sample) (:id new-db)))
            (is (= bundled-engine (:engine new-db)))
            ;; clean it up so the leaked is_sample row can't pollute tests that select on is_sample.
            (t2/delete! :model/Database :id (:id new-db))))))))

(deftest replace-sample-database-cascades-to-synced-schema-test
  (testing "On H2 -> SQLite replacement, deleting the old sample DB also removes its synced schema (Tables, Fields,
           Dimensions) and dashboard tabs - i.e. every entity belonging to the old H2 sample database is gone"
    (mt/with-temp
      [:model/Database  old-sample {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}
       :model/Table     table      {:db_id (:id old-sample)}
       :model/Field     field      {:table_id (:id table)}
       :model/Dimension dimension  {:field_id (:id field)}
       :model/Card      sample-card {:database_id (:id old-sample)}
       :model/Dashboard sample-dash {}
       :model/DashboardTab tab     {:dashboard_id (:id sample-dash)}
       :model/DashboardCard _ {:dashboard_id (:id sample-dash), :card_id (:id sample-card)}
       :model/Collection examples  {:name "Examples", :is_sample true}]
      ;; Skip recreating the replacement Sample Database (load-sample-content? false): this test only checks the
      ;; old schema cascades away, and recreating it would leak an is_sample row other tests select on.
      (with-redefs [config/load-sample-content? (constantly false)]
        (#'sample-data/update-sample-database-if-needed! old-sample))
      (testing "the old sample DB is deleted"
        (is (not (t2/exists? :model/Database :id (:id old-sample)))))
      (testing "its synced schema cascades away"
        (is (not (t2/exists? :model/Table :id (:id table))))
        (is (not (t2/exists? :model/Field :id (:id field))))
        (is (not (t2/exists? :model/Dimension :id (:id dimension)))))
      (testing "its card and the dashboard emptied by the card's removal are deleted, along with the dashboard's tabs"
        (is (not (t2/exists? :model/Card :id (:id sample-card))))
        (is (not (t2/exists? :model/Dashboard :id (:id sample-dash))))
        (is (not (t2/exists? :model/DashboardTab :id (:id tab)))))
      (testing "the Example collection is preserved (the engine swap no longer deletes it)"
        (is (t2/exists? :model/Collection :id (:id examples)))))))

(deftest replace-sample-database-survives-dangling-visualizer-ref-test
  (testing "The engine swap completes when a sample dashcard has a dangling visualizer ref"
    (mt/with-temp
      [:model/Database  old-sample  {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}
       :model/Card      sample-card {:database_id (:id old-sample)}
       :model/Dashboard sample-dash {}
       :model/DashboardCard dc {:dashboard_id (:id sample-dash), :card_id (:id sample-card)}]
      ;; Inject a dangling visualizer ref via raw SQL so the model's hooks don't reject/rewrite it.
      (t2/query-one {:update (t2/table-name :model/DashboardCard)
                     :set    {:visualization_settings
                              (json/encode {:visualization
                                            {:columnValuesMapping
                                             {:COLUMN_1 [{:sourceId "card:gEnfWx10SmfjiccZpcGrj"}]}}})}
                     :where  [:= :id (:id dc)]})
      (with-redefs [config/load-sample-content? (constantly false)]
        (testing "the replacement completes instead of throwing on the dangling ref"
          (is (nil? (#'sample-data/update-sample-database-if-needed! old-sample)))))
      (testing "the old sample DB and the dashboard emptied by its removal are deleted"
        (is (not (t2/exists? :model/Database :id (:id old-sample))))
        (is (not (t2/exists? :model/Card :id (:id sample-card))))
        (is (not (t2/exists? :model/Dashboard :id (:id sample-dash))))))))

(def ^:private edn-example-collection-entity-id
  "Stable entity id of the bundled Examples collection in sample-content.edn."
  "HyB3nRtqb7pBPhFG26evI")

(deftest recreate-example-content-reuses-collection-test
  (testing "recreate-example-content! reuses an existing Example collection (matched by entity id) and preserves the
           user content filed into it, instead of deleting it and creating a brand new collection"
    (mt/with-model-cleanup [:model/Collection :model/Card :model/Dashboard :model/DashboardCard
                            :model/Dimension :model/Permissions]
      (with-temp-sample-database-db [db]
        (mt/with-temp
          [:model/Collection examples  {:name "Examples", :is_sample true, :location "/"
                                        :entity_id edn-example-collection-entity-id}
           ;; a question a user filed into the Example collection - must survive the engine swap
           :model/Card       user-card {:name "user question", :collection_id (:id examples), :database_id (:id db)}]
          (example-content/recreate-example-content! (:id db))
          (testing "the existing Example collection is reused, not duplicated"
            (is (t2/exists? :model/Collection :id (:id examples)))
            (is (= 1 (t2/count :model/Collection :entity_id edn-example-collection-entity-id))))
          (testing "the user's content survives, still filed in the reused Example collection"
            (is (t2/exists? :model/Card :id (:id user-card)))
            (is (= (:id examples) (:collection_id (t2/select-one :model/Card :id (:id user-card))))))
          (testing "the bundled sample content is recreated on the sample database, in the reused collection"
            (is (pos? (t2/count :model/Card :database_id (:id db))))
            (is (t2/exists? :model/Dashboard :collection_id (:id examples)))))))))

(deftest replace-sample-database-skips-content-when-sync-fails-test
  (testing "When the replacement sync fails, example content is NOT recreated - recreating against an unsynced DB
           remaps every card onto empty id maps, which is silent corruption worse than a missing example collection"
    (mt/with-model-cleanup [:model/Database]
      (mt/with-temp [:model/Database old-sample {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}]
        (let [recreate-called? (atom false)]
          (with-redefs [example-content/recreate-example-content! (fn [_] (reset! recreate-called? true))]
            (mt/with-dynamic-fn-redefs [sync/sync-database! (fn [_] (throw (ex-info "sync boom" {})))]
              (#'sample-data/update-sample-database-if-needed! old-sample)))
          (testing "recreate is skipped"
            (is (false? @recreate-called?)))
          (testing "the engine swap itself still completed - a new SQLite sample DB exists"
            (is (t2/exists? :model/Database :is_sample true :engine :sqlite))))))))

(defn- db-level-perms
  "DB-level data-permission rows for `db-id` as a comparable map {[group-id perm-type] perm-value}."
  [db-id]
  (into {}
        (for [{:keys [group_id perm_type perm_value]} (t2/select :model/DataPermissions :db_id db-id :table_id nil)]
          [[group_id perm_type] perm_value])))

(deftest sample-database-upgrade-preserves-permissions-test
  (testing "The H2->SQLite sample-database swap re-applies each group's permissions to the new sample DB"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? false)
      (mt/with-temp [:model/PermissionsGroup custom-group {}
                     :model/Database         old-sample {:engine :h2, :is_sample true, :details {:db "mem:old-sample"}}]
        ;; Put the old sample DB into a distinctive, non-default permission state, so we test that real custom
        ;; permissions carry forward - not just that the defaults happen to line up.
        (perms/set-database-permission! (perms/all-users-group) (:id old-sample) :perms/create-queries :no)
        (perms/set-database-permission! custom-group            (:id old-sample) :perms/create-queries :query-builder)
        (let [expected-perms (db-level-perms (:id old-sample))]
          (with-redefs [config/load-sample-content? (constantly true)]
            (#'sample-data/update-sample-database-if-needed! old-sample))
          (let [new-sample (t2/select-one :model/Database :is_sample true :engine :sqlite)]
            (is (some? new-sample) "the swap created a SQLite sample database")
            (testing "every group's db-level permissions match the old sample DB exactly"
              (is (= expected-perms (db-level-perms (:id new-sample)))))
            (testing "the custom permission state specifically carried forward"
              (let [new-perms (db-level-perms (:id new-sample))]
                (is (= :no            (new-perms [(:id (perms/all-users-group)) :perms/create-queries])))
                (is (= :query-builder (new-perms [(:id custom-group)            :perms/create-queries])))))))))))

(deftest sample-database-schedule-sync-test
  (testing "Check that the sample database has scheduled sync jobs, just like a newly created database"
    (mt/with-temp-empty-app-db [_conn :h2]
      (api.database-test/with-db-scheduler-setup!
        (mdb/setup-db! :create-sample-content? true)
        (sample-data/extract-and-sync-sample-database!)
        (testing "Sense check: a newly created database should have sync jobs scheduled"
          (mt/with-temp [:model/Database db {}]
            (is (= (task.sync-databases-test/all-db-sync-triggers-name db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name db)))))
        (testing "The sample database should also have sync jobs scheduled"
          (let [sample-db (t2/select-one :model/Database :is_sample true)]
            (is (= (task.sync-databases-test/all-db-sync-triggers-name sample-db)
                   (task.sync-databases-test/query-all-db-sync-triggers-name sample-db)))))))))
