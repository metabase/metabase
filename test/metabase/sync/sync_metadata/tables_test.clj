(ns metabase.sync.sync-metadata.tables-test
  "Test for the logic that syncs Table models with the metadata fetched from a DB."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models :refer [Database Table]]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [toucan.db :as db]))

(tx/defdataset db-with-some-cruft
  [["acquired_toucans"
     [{:field-name "species",              :base-type :type/Text}
      {:field-name "cam_has_acquired_one", :base-type :type/Boolean}]
     [["Toco"               false]
      ["Chestnut-Mandibled" true]
      ["Keel-billed"        false]
      ["Channel-billed"     false]]]
   ["south_migrationhistory"
    [{:field-name "app_name",  :base-type :type/Text}
     {:field-name "migration", :base-type :type/Text}]
    [["main" "0001_initial"]
     ["main" "0002_add_toucans"]]]])

(deftest crufty-tables-test
  (testing "south_migrationhistory, being a CRUFTY table, should still be synced, but marked as such"
    (mt/dataset metabase.sync.sync-metadata.tables-test/db-with-some-cruft
      (is (= #{{:name "SOUTH_MIGRATIONHISTORY", :visibility_type :cruft, :initial_sync_status "complete"}
               {:name "ACQUIRED_TOUCANS",       :visibility_type nil,    :initial_sync_status "complete"}}
             (set (for [table (db/select [Table :name :visibility_type :initial_sync_status], :db_id (mt/id))]
                    (into {} table))))))))

(deftest retire-tables-test
  (testing "`retire-tables!` should retire the Table(s) passed to it, not all Tables in the DB -- see #9593"
    (mt/with-temp* [Database [db]
                    Table    [table-1 {:name "Table 1", :db_id (u/the-id db)}]
                    Table    [_       {:name "Table 2", :db_id (u/the-id db)}]]
      (#'sync-tables/retire-tables! db #{{:name "Table 1", :schema (:schema table-1)}})
      (is (= {"Table 1" false, "Table 2" true}
             (db/select-field->field :name :active Table, :db_id (u/the-id db)))))))

;; TODO - Consider moving this logic as well as the same logic and the exec! fn from metabase.driver.postgres-test
;; to metabase.test. We might want to see if there's at least one more case of generality before doing so, though.
;; Also, if we did this, we might want to defmulti it so that we can safely bounce and db type.
(defn- drop-if-exists-and-create-db!
  "Drop a Postgres database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (mt/dbdef->connection-details :postgres :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                       FROM pg_stat_activity
                       WHERE pg_stat_activity.datname = ?;" db-name])
    ;; create the DB
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\";
                                  CREATE DATABASE \"%s\";"
                                 db-name db-name)]
                   {:transaction? false})))

(deftest get-or-create-named-table!-test
  (mt/test-driver :postgres
    (testing (str "Notify that a new table has been added via API (#25496)")
      (let [db-name  "sync_new_table_test"
            details  (mt/dbdef->connection-details :postgres :db {:database-name db-name})
            spec     (sql-jdbc.conn/connection-details->spec :postgres details)
            exec!    (fn [spec statements] (doseq [statement statements] (jdbc/execute! spec [statement])))
            tableset #(set (map :name (db/select 'Table :db_id (:id %))))]
        ;; create the postgres DB
        (drop-if-exists-and-create-db! db-name)
        (mt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname db-name)}]
          (let [sync! #(sync/sync-database! database)]
            ;; create a main partitioned table and two partitions for it
            (exec! spec ["CREATE TABLE FOO (val bigint NOT NULL);"
                         "CREATE TABLE BAR (val bigint NOT NULL);"])
            ;; now sync the DB
            (sync!)
            ;; Assert the baseline - both table exist
            (let [tables (tableset database)]
              (is (= #{"foo" "bar"} tables)))
            ;; Create two new tables in the user/external db
            (exec! spec ["CREATE TABLE FERN (val bigint NOT NULL);"
                         "CREATE TABLE DOC (val bigint NOT NULL);"])
            ;; Add only one of the tables to be synched
            ;(sync/get-or-create-named-table! database {:table-name  "fern" :schema-name "public"})
            (sync-tables/get-or-create-named-table! database {:table-name "fern"})
            ;; Assert that the synched table is in the MB db and the unsynched table is not.
            (let [tables (tableset database)]
              (is (= #{"fern" "foo" "bar"} tables)))
            (exec! spec ["CREATE SCHEMA IF NOT EXISTS private;"
                         "CREATE TABLE private.FERN (val bigint NOT NULL);"])
            ;; Now that we've got two FERN tables, a named get is insufficient
            (is (= :ambiguous-table
                   (try
                     (sync-tables/get-or-create-named-table! database {:table-name "fern"})
                     (catch Exception _ :ambiguous-table))))
            ;; Providing a schema + name for an ambiguous table works (This is a get as fern is already present)
            (is (= {:name "fern" :schema "public"}
                   (select-keys
                    (sync-tables/get-or-create-named-table! database {:table-name "fern" :schema-name "public"})
                    [:name :schema])))
            ;; Doc is now ambiguous and both docs are only in the warehouse
            (exec! spec ["CREATE TABLE private.DOC (val bigint NOT NULL);"
                         "CREATE TABLE private.FROOB (val bigint NOT NULL);"])
            ;; We can create using an ambiguous schema
            (sync-tables/get-or-create-named-table! database {:table-name "doc" :schema-name "private"})
            (let [tables (tableset database)]
              (is (= #{"fern" "foo" "bar" "doc"} tables)))))))))
