(ns metabase.sync.sync-metadata.fields-test
  "Tests for the logic that syncs Field models with the Metadata fetched from a DB. (There are more tests for this
  behavior in the namespace `metabase.sync-database.sync-dynamic-test`, which is sort of a misnomer.)"
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer [expect]]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [query-processor :as qp]
             [sync :as sync]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test.data.interface :as tdi]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn- with-test-db-before-and-after-dropping-a-column
  "Testing function that performs the following steps:

   1.  Create a temporary test database & syncs it
   2.  Executes `(f database)`
   3.  Drops one of the columns from the test DB & syncs it again
   4.  Executes `(f database)` a second time
   5.  Returns a map containing results from both calls to `f` for comparison."
  [f]
  ;; let H2 connect to DBs that aren't created yet
  (binding [mdb/*allow-potentailly-unsafe-connections* true]
    (let [driver  (driver/engine->driver :h2)
          details (tdi/database->connection-details driver :db {:db            "mem:deleted_columns_test"
                                                                :database-name "deleted_columns_test"})
          exec!   (fn [& statements]
                    (doseq [statement statements]
                      (jdbc/execute! (sql/connection-details->spec driver details) statement)))]
      ;; first, create a new in-memory test DB and add some data to it
      (exec!
       ;; H2 needs that 'guest' user for QP purposes. Set that up
       "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
       ;; Keep DB open until we say otherwise :)
       "SET DB_CLOSE_DELAY -1;"
       ;; create table & load data
       "DROP TABLE IF EXISTS \"birds\";"
       "CREATE TABLE \"birds\" (\"species\" VARCHAR PRIMARY KEY, \"example_name\" VARCHAR);"
       "GRANT ALL ON \"birds\" TO GUEST;"
       (str "INSERT INTO \"birds\" (\"species\", \"example_name\") VALUES "
            "('House Finch', 'Marshawn Finch'),  "
            "('California Gull', 'Steven Seagull'), "
            "('Chicken', 'Colin Fowl');"))
      ;; now create MB models + sync
      (tt/with-temp Database [database {:engine :h2, :details details, :name "Deleted Columns Test"}]
        (sync/sync-database! database)
        ;; ok, let's see what (f) gives us
        (let [f-before (f database)]
          ;; ok cool! now delete one of those columns...
          (exec! "ALTER TABLE \"birds\" DROP COLUMN \"example_name\";")
          ;; ...and re-sync...
          (sync/sync-database! database)
          ;; ...now let's see how (f) may have changed! Compare to original.
          {:before-drop f-before
           :after-drop  (f database)})))))


;; make sure sync correctly marks a Field as active = false when it gets dropped from the DB
(expect
  {:before-drop #{{:name "species",      :active true}
                  {:name "example_name", :active true}}
   :after-drop  #{{:name "species",      :active true}
                  {:name "example_name", :active false}}}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (set
       (map (partial into {})
            (db/select [Field :name :active]
              :table_id [:in (db/select-ids Table :db_id (u/get-id database))]))))))

;; make sure deleted fields doesn't show up in `:fields` of a table
(expect
  {:before-drop #{"species" "example_name"}
   :after-drop  #{"species"}}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (let [table (hydrate (db/select-one Table :db_id (u/get-id database)) :fields)]
        (set
         (map :name (:fields table)))))))

;; make sure that inactive columns don't end up getting spliced into queries! This test arguably belongs in the query
;; processor tests since it's ultimately checking to make sure columns marked as `:active` = `false` aren't getting
;; put in queries with implicit `:fields` clauses, but since this could be seen as covering both QP and sync (my and
;; others' assumption when first coming across bug #6146 was that this was a sync issue), this test can stay here for
;; now along with the other test we have testing sync after dropping a column.
(expect
  {:before-drop (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\", "
                     "\"PUBLIC\".\"birds\".\"example_name\" AS \"example_name\" "
                     "FROM \"PUBLIC\".\"birds\" "
                     "LIMIT 1048576")
   :after-drop  (str "SELECT \"PUBLIC\".\"birds\".\"species\" AS \"species\" "
                     "FROM \"PUBLIC\".\"birds\" "
                     "LIMIT 1048576")}
  (with-test-db-before-and-after-dropping-a-column
    (fn [database]
      (-> (qp/process-query {:database (u/get-id database)
                             :type     :query
                             :query    {:source-table (db/select-one-id Table
                                                        :db_id (u/get-id database), :name "birds")}})
          :data
          :native_form
          :query))))
