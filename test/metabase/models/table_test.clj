(ns metabase.models.table-test
  (:require [clojure.test :refer :all]
            [metabase
             [db :as mdb]
             [models :refer [Database Table]]
             [test :as mt]]
            [toucan.db :as db]))

(deftest disallow-duplicate-tables-test
  (testing "Migration #99\n"
    (testing "Shouldn't be able to create two Tables with the same name..."
      (let [table-defaults (dissoc (Table (mt/id :venues)) :id :db_id :schema :name)]
        (println "table-defaults:" table-defaults) ; NOCOMMIT
        (mt/with-temp Database [db]
          (letfn [(create-table! [schema]
                    (db/insert! Table (merge table-defaults {:db_id (:id db), :schema schema, :name "birds"})))
                  (table-count [schema]
                    (db/count Table :db_id (:id db), :schema schema, :name "birds"))]
            (testing "and the same schema"
              (create-table! "PUBLIC")
              (is (thrown?
                   Exception
                   (create-table! "PUBLIC")))
              (is (= 1
                     (table-count "PUBLIC"))))
            (when (= (mdb/db-type) :postgres)
              (testing "and a NULL schema (this is only enforced for Postgres, since other DBs can't create this index)"
                (create-table! nil)
                (is (thrown?
                     Exception
                     (create-table! nil)))
                (is (= 1
                       (table-count nil)))))))))))
