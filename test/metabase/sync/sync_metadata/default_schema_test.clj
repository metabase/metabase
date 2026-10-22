(ns ^:mb/driver-tests metabase.sync.sync-metadata.default-schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.util-test :as sync.util-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest sync-default-schema-test
  (mt/test-driver :h2
    (mt/dataset test-data
      (let [database (mt/db)]
        (t2/update! :model/Database (:id database) {:default_schema nil})
        (let [{:keys [step-info task-history]}
              (sync.util-test/sync-database! "sync-default-schema" (assoc database :default_schema nil))]
          (testing "the sync step reports the discovered schema"
            (is (= {:default-schema "PUBLIC"}
                   (sync.util-test/only-step-keys step-info)))
            (is (= {:default-schema "PUBLIC"}
                   (:task_details task-history))))
          (testing "the discovered schema is persisted on the Database"
            (is (= "PUBLIC"
                   (t2/select-one-fn :default_schema :model/Database (:id database))))))))))
