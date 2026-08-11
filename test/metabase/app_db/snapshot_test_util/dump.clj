(ns metabase.app-db.snapshot-test-util.dump
  "What a dialect has to provide to be dumpable.")

(defprotocol Dumper
  (dump-statements [dumper details conn]
    "The statements that recreate the DB behind `conn`, DATABASECHANGELOG rows included.

    `details` is the connection details map the DB was created with, as [[metabase.test.data.interface/
    dbdef->connection-details]] returns it -- what a command-line dump tool needs and a JDBC connection does not
    expose. It is nil for dialects dumped through `conn` alone."))
