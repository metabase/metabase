(ns metabase.cmd.rotate-encryption-key
  (:require
   [metabase.db :as mdb]
   [metabase.util.log :as log]))

(defn rotate-encryption-key!
  "Rotate the current configured db using the current `MB_ENCRYPTION_SECRET_KEY` env var and `to-key` argument."
  [to-key]
  (when-not (mdb/db-is-set-up?)
    (log/warnf "Database not found. Metabase will create a new database at %s and proceed encrypting." "2")
    (mdb/setup-db! :create-sample-content? true))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (mdb/encrypt-db (mdb/db-type) (mdb/data-source) to-key))
