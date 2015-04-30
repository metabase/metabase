(ns metabase.test.data.mongo
  (:require [metabase.db :refer :all]
            (metabase.models [table :refer [Table]])
            [metabase.test.data.interface :refer :all]))

(deftype MongoTestData []
  TestData
  (load! [_])

  (db-name [_]
    "Mongo Test")
  (connection-str [_]
    "mongodb://localhost/metabase-test")

  (table-name->table [_ db-id table-name]
    (sel :one Table :db_id db-id :name table-name))

  (field-name->field [_ table-name field-name]))
