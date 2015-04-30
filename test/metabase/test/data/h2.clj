(ns metabase.test.data.h2
  (:require [clojure.string :as s]
            [metabase.db :refer :all]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.test.data.interface :refer :all]))

(deftype H2TestData []
  TestData
  (load! [_])

  (db-name [_]
    "Test Database")

  (connection-str [_]
    (let [filename (format "%s/target/test-data" (System/getProperty "user.dir"))]
      (format "file:%s;AUTO_SERVER=TRUE;DB_CLOSE_DELAY=-1" filename)))

  (table-name->table [_ db-id table-name]
    (sel :one Table :db_id db-id :name (s/upper-case (name table-name))))

  (field-name->field [this table-id field-name]
    (sel :one Field :table_id table-id :name (s/upper-case (name field-name)))))
