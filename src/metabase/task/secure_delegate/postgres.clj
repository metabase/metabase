(ns metabase.task.secure-delegate.postgres
  "Quartz `DriverDelegate` for Postgres: `PostgreSQLDelegate` (byte-based BLOB reads) with
  `getObjectFromBlob` overridden to read through the allow-list. The postgres counterpart of
  `metabase.task.secure-delegate.std`; keep them in sync. See [[metabase.task.secure-delegate.core]]."
  (:gen-class :extends org.quartz.impl.jdbcjobstore.PostgreSQLDelegate
              :name metabase.task.secure_delegate.SecurePostgresDelegate)
  (:require
   [metabase.task.secure-delegate.core :as secure-delegate]))

(set! *warn-on-reflection* true)

(defn -getObjectFromBlob
  "gen-class override — see [[metabase.task.secure-delegate.core/object-from-blob-postgres]]."
  [_this rs col-name]
  (secure-delegate/object-from-blob-postgres rs col-name))
