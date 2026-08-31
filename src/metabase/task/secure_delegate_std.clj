(ns metabase.task.secure-delegate-std
  "Quartz `DriverDelegate` for H2/MySQL: `StdJDBCDelegate` with `getObjectFromBlob` overridden to read
  through the allow-list. Logic lives in [[metabase.task.secure-delegate]]; keep this in sync with
  `metabase.task.secure-delegate-postgres` (differs only in base class)."
  (:gen-class :extends org.quartz.impl.jdbcjobstore.StdJDBCDelegate
              :name metabase.task.SecureStdDelegate)
  (:require
   [metabase.task.secure-delegate :as secure-delegate]))

(set! *warn-on-reflection* true)

(defn -getObjectFromBlob
  "gen-class override — see [[metabase.task.secure-delegate/object-from-blob-std]]."
  [_this rs col-name]
  (secure-delegate/object-from-blob-std rs col-name))
