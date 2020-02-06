(ns metabase.models.database-test
  (:require [clojure
             [string :refer [join lower-case split]]
             [test :refer :all]]
            [metabase
             [models :refer [Database]]]
            [toucan.db :as db]))

(defn- create-database!
  [db-name engine]
  (db/insert! Database
        :name db-name
        :engine (name engine)
        :details {:db (join "-" (mapv lower-case (split db-name #"(?=[A-Z])")))}))

(deftest disallow-duplicate-databases-with-same-name-and-engine
  (testing "Migration #107\n"
    (testing "Shouldn't be able to create two Databases with the same name and engine..."

      (testing "mysql..."
        (let [db (create-database! "TestDatabase" :mysql)]
          (is (thrown? Exception (create-database! "TestDatabase" :mysql)))))

      (testing "mariadb..."
        (let [db (create-database! "TestDatabase" :mariadb)]
          (is (thrown? Exception (create-database! "TestDatabase" :mariadb)))))

      (testing "h2..."
        (let [db (create-database! "TestDatabase" :h2)]
          (is (thrown? Exception (create-database! "TestDatabase" :h2)))))

      (testing "postgresql..."
        (let [db (create-database! "TestDatabase" :postgresql)]
          (is (thrown? Exception (create-database! "TestDatabase" :postgresql))))))))
