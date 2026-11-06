(ns ^:mb/app-db-migrations-test metabase-enterprise.data-complexity-score.appdb-source-migration-test
  "The CLI's reads against appdbs migrated to an older schema, so a change that breaks an older appdb fails here rather
  than in a customer's run."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- insert-database! []
  (t2/insert-returning-pk! :metabase_database {:name       "Complexity CLI Test DB"
                                               :engine     "h2"
                                               :details    "{}"
                                               :created_at :%now
                                               :updated_at :%now}))

(defn- insert-collection! []
  (t2/insert-returning-pk! :collection (merge (mt/with-temp-defaults :model/Collection)
                                              {:name "Complexity CLI Test Collection"
                                               :slug "complexity_cli_test_collection"})))

(defn- cli-table-row
  "The CLI's read of the Table with `table-id`, limited to the columns user settings can change."
  [table-id]
  (some #(when (= table-id (:id %)) (select-keys % [:is_published :collection_id :data_layer :data_authority]))
        ((:universe-tables-fn (appdb-source/reads)) Integer/MAX_VALUE)))

(deftest cli-reads-user-settings-on-a-v64-appdb-test
  (testing "on an appdb where v64 moved user values into the settings table, the CLI reads them from there"
    (impl/test-migrations ["v64.2026-09-11T00:00:00" "v64.2026-09-11T00:00:07"] [migrate!]
      (let [db-id         (insert-database!)
            collection-id (insert-collection!)
            table-id      (t2/insert-returning-pk! :metabase_table {:db_id          db-id
                                                                    :name           "published"
                                                                    :active         true
                                                                    :is_published   true
                                                                    :collection_id  collection-id
                                                                    :data_layer     "final"
                                                                    :data_authority "authoritative"
                                                                    :created_at     :%now
                                                                    :updated_at     :%now})]
        (migrate!)
        (testing "metabase_table alone says the Table is unpublished"
          (is (=? {:is_published false, :collection_id nil}
                  (t2/select-one [:metabase_table :is_published :collection_id] :id table-id))))
        (is (= {:is_published   true
                :collection_id  collection-id
                :data_layer     "final"
                :data_authority "authoritative"}
               (cli-table-row table-id)))))))

(deftest cli-reads-metabase-table-after-the-copy-back-test
  (testing "once ceygl0 copies user values back into metabase_table, the CLI reads metabase_table alone"
    (impl/test-migrations ["ceygl0" "ceygl0"] [migrate!]
      (let [db-id         (insert-database!)
            collection-id (insert-collection!)
            table-id      (t2/insert-returning-pk! :metabase_table {:db_id      db-id
                                                                    :name       "published"
                                                                    :active     true
                                                                    :created_at :%now
                                                                    :updated_at :%now})
            user-values   {:is_published   true
                           :collection_id  collection-id
                           :data_layer     "final"
                           :data_authority "authoritative"}]
        (t2/insert! :metabase_table_user_settings (assoc user-values :table_id table-id, :data_layer_set true))
        (testing "before the copy-back, the values come from the settings row"
          (is (= user-values (cli-table-row table-id))))
        (migrate!)
        (testing "after it, metabase_table holds them and a later settings value no longer decides"
          (t2/update! :metabase_table_user_settings :table_id table-id {:is_published false})
          (is (= user-values (cli-table-row table-id))))))))
