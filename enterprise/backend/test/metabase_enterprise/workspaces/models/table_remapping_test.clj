(ns metabase-enterprise.workspaces.models.table-remapping-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.models.table-remapping :as table-remapping]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest write-function-statement-counts-do-not-grow-with-databases-test
  (mt/with-temp [:model/Database {d1 :id} {}
                 :model/Database {d2 :id} {}
                 :model/Database {d3 :id} {}
                 :model/Database {d4 :id} {}
                 :model/Database {d5 :id} {}
                 :model/Database {d6 :id} {}]
    (let [database-ids [d1 d2 d3 d4 d5 d6]
          delete!      (fn [ids]
                         (doseq [id ids]
                           (table-remapping/upsert-table-remapping! id {:schema "s" :table "from"} {:schema "t" :table "to"}))
                         (events.tu/statement-count! #(table-remapping/delete-table-remappings-of-databases! ids)))]
      (delete! (take 1 database-ids))
      (is (= (delete! (take 2 database-ids)) (delete! (take 6 database-ids)))))))
