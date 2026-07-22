(ns ^:mb/driver-tests metabase-enterprise.database-routing.sandboxing-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest sandboxing-applies-to-routed-destination-test
  (testing "a row sandbox defined on a router table filters rows in the per-user routed destination database"
    (mt/with-premium-features #{:database-routing :sandboxes :advanced-permissions}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (met/with-user-attributes! :rasta {"db_name" "destination-db" "filter_val" "keep"}
          (e2e/with-routing-setup! [router-db [[destination-db "destination-db"]]]
            (e2e/execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('keep')")
            (e2e/execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('drop')")
            (e2e/execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-only')")
            (let [router-table (t2/select-one :model/Table :db_id (u/the-id router-db))
                  str-field    (t2/select-one :model/Field :table_id (u/the-id router-table))
                  all-users    (perms/all-users-group)]
              (mt/with-no-data-perms-for-all-users!
                (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                        :user_attribute "db_name"}
                               :model/Sandbox _ {:group_id             (u/the-id all-users)
                                                 :table_id             (u/the-id router-table)
                                                 :card_id              nil
                                                 :attribute_remappings {"filter_val" [:dimension [:field (u/the-id str-field) nil]]}}]
                  (data-perms/set-database-permission! all-users (u/the-id router-db) :perms/view-data :unrestricted)
                  (data-perms/set-table-permission! all-users (u/the-id router-table) :perms/create-queries :query-builder)
                  (let [mp    (lib.metadata.jvm/application-database-metadata-provider (u/the-id router-db))
                        query (lib/query mp (lib.metadata/table mp (u/the-id router-table)))]
                    (mt/with-temp [:model/Card card {:name          "Router question"
                                                     :database_id   (u/the-id router-db)
                                                     :dataset_query query}]
                      (testing "the sandboxed user only sees the destination row matching their attribute"
                        (let [response (mt/user-http-request :rasta :post 202 (str "card/" (u/the-id card) "/query"))]
                          (is (= [["keep"]] (mt/rows response))))))))))))))))
