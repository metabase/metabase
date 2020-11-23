(ns metabase.db.schema-migrations-test
  "Tests for the schema migrations defined in the Liquibase YAML files. The basic idea is:

  1. Create a temporary H2/Postgres/MySQL/MariaDB database
  2. Run all migrations up to a certain point
  3. Load some arbitrary data
  4. run migration(s) after that point (verify that they actually run)
  5. verify that data looks like what we'd expect after running migration(s)

  See `metabase.db.schema-migrations-test.impl` for the implementation of this functionality."
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Database Field Table]]
             [util :as u]]
            [metabase.db.schema-migrations-test.impl :as impl]
            [metabase.models.user :refer [User]]
            [metabase.test.util :as tu]
            [toucan.db :as db])
  (:import java.util.UUID))

(deftest database-position-test
  (testing "Migration 165: add `database_position` to Field"
    (impl/test-migrations 165 [migrate!]
      ;; create a Database with a Table with 2 Fields
      (db/simple-insert! Database {:name "DB", :engine "h2", :created_at :%now, :updated_at :%now})
      (db/simple-insert! Table {:name "Table", :db_id 1, :created_at :%now, :updated_at :%now, :active true})
      (let [mock-field {:table_id 1, :created_at :%now, :updated_at :%now, :base_type "type/Text", :database_type "VARCHAR"}]
        (db/simple-insert! Field (assoc mock-field :name "Field 1"))
        (db/simple-insert! Field (assoc mock-field :name "Field 2")))
      (testing "sanity check: Fields should not have a `:database_position` column yet"
        (is (not (contains? (Field 1) :database_position))))
      ;; now run migration 165
      (migrate!)
      (testing "Fields should get `:database_position` equal to their IDs"
        (doseq [id [1 2]]
          (testing (format "Field %d" id)
            (is (= id
                   (db/select-one-field :database_position Field :id id)))))))))

(defn- create-raw-user [email]
  "create a user but skip pre and post insert steps"
  (db/simple-insert! User
    :email        email
    :first_name   (tu/random-name)
    :last_name    (tu/random-name)
    :password     (str (UUID/randomUUID))
    :date_joined  :%now
    :is_active    true
    :is_superuser false))

(deftest email-lowercasing-test
  (testing "Migration 268-272: basic lowercasing `email` in `core_user`"
    (impl/test-migrations [268 272] [migrate!]
      (let [e1 "Foo@email.com"
            e2 "boo@email.com"]
        (doseq [e [e1 e2]]
          (create-raw-user e))
        ;; Run migrations 268 - 272
        (migrate!)
        (doseq [e [e1 e2]]
          (is (= true
                 (db/exists? User :email (u/lower-case-en e1)))))))))
