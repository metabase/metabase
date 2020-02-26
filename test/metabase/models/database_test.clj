(ns metabase.models.database-test
  (:require [clojure
             [string :refer [join lower-case split]]
             [test :refer :all]]
            [metabase.models :refer [Database]]
            [metabase
             [driver :as driver]
             [util :as u]]
            [toucan.db :as db]))

(driver/register! ::test-driver
                  :parent :sql-jdbc
                  :abstract? true)

(defn- create-database!
  [db-name]
  (db/insert! Database
              :name db-name
              :engine (u/qualified-name ::test-driver)
              :details {:db (join "-" (mapv lower-case (split db-name #"(?=[A-Z])")))}))

(defn- delete-database!
  [db-name]
  (db/delete! Database :name db-name))

(deftest disallow-duplicate-databases-with-same-name-and-engine
  (testing "Migration #162\n"
    (testing "Shouldn't be able to create two Databases with the same name and engine..."
      (try
        (do
          (create-database! "TestDatabase")
          (is (thrown? Exception (create-database! "TestDatabase"))))
        (finally
          (delete-database! "TestDatabase"))))))
