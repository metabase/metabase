(ns metabase.test.data.mongo
  (:require [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data.interface :refer :all]))

(deftype MongoTestData []
  TestData
  (load! [_])

  (db-name [_]
    "Mongo Test")

  (connection-str [_]
    "mongodb://localhost/metabase-test")

  (table-name->table [_ db-id table-name]
    (sel :one Table :db_id db-id :name (name table-name)))

  (field-name->field [this table-id field-name]
    (sel :one Field :table_id table-id :name (name field-name))))
