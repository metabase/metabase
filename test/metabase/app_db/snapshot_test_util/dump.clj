(ns metabase.app-db.snapshot-test-util.dump
  "What a dialect has to provide to be dumpable.")

(defprotocol Dumper
  (dump-statements [dumper server conn]
    "The statements that recreate the DB behind `conn`, DATABASECHANGELOG rows included.

    The `server` map supplies `:exec!` to run the dump client and `:details` with the database and user.
    Optional `:dump-details` supplies the host and port seen by the client. Defaults address a local server.
    Dialects that dump through `conn` alone accept nil."))
