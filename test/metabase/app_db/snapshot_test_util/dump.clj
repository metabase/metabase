(ns metabase.app-db.snapshot-test-util.dump
  "What a dialect has to provide to be dumpable.")

(defprotocol Dumper
  (dump-statements [dumper server conn]
    "The statements that recreate the DB behind `conn`, DATABASECHANGELOG rows included.

    `server` is what [[metabase.app-db.snapshot-test-util.server/do-with-server!]] yields: `:exec!`, which runs a
    command inside the container the DB is running in, and `:details`, naming the database and user to dump. Running
    the client there rather than off PATH is what keeps it the one shipped with the server it reads. It is nil for
    dialects dumped through `conn` alone."))
