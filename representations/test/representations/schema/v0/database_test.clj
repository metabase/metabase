(ns representations.schema.v0.database-test
  (:require [clojure.test :refer :all]
            [representations.read :as read]))

(deftest database-schema-test
  (testing "database representation with basic fields is valid"
    (let [database {:type :database
                    :version :v0
                    :name "my-db"
                    :display_name "My Database"
                    :engine "postgres"
                    :connection_details {:host "localhost"
                                         :port 5432
                                         :dbname "mydb"}}]
      (is (= database
             (read/parse database)))))
  (testing "database representation with schemas is valid"
    (let [database {:type :database
                    :version :v0
                    :name "my-db"
                    :display_name "My Database"
                    :engine "postgres"
                    :description "Test database"
                    :connection_details {:host "localhost"}
                    :schemas [{:name "public"
                               :tables [{:name "users"
                                         :columns [{:name "id"
                                                    :type "integer"
                                                    :pk true}
                                                   {:name "email"
                                                    :type "varchar"}]}]}]}]
      (is (= database
             (read/parse database))))))
