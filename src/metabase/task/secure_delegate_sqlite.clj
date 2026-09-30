(ns metabase.task.secure-delegate-sqlite
  "SQLite Quartz delegate. SQLite JDBC supports byte arrays, but not ResultSet.getBlob."
  (:gen-class :extends org.quartz.impl.jdbcjobstore.StdJDBCDelegate
              :name metabase.task.SecureSqliteDelegate)
  (:require
   [metabase.task.secure-delegate :as secure-delegate]))

(defn -getObjectFromBlob
  "Read SQLite BLOBs through the same deserialization allow-list as the other app databases."
  [_this rs col-name]
  (secure-delegate/object-from-blob-postgres rs col-name))
