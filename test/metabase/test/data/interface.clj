(ns metabase.test.data.interface
  "`TestData` protocol.")

(defprotocol TestData
  ;; Loading
  (load! [this]
    "Load test data, if needed. This should create relevant data, and call `metabase.driver.sync-database!`.")

  ;; DB
  (db-name [this]
    "Name to use for test `Database`.")
  (connection-str [this]
    "Connection string to use to connect to test `Database`.")

  ;; Fetching Fns
  (table-name->table [this db-id table-name])
  (field-name->field [this table-name field-name]))
