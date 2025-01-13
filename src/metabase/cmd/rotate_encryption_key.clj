(ns metabase.cmd.rotate-encryption-key
  (:require
   [metabase.db :as mdb]
   [metabase.util.log :as log]))

(defn rotate-encryption-key!
  "Rotate the current configured db using the current `MB_ENCRYPTION_SECRET_KEY` env var and `to-key` argument.
  An empty to-key will decrypt the database."
  [to-key]
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to encrypting")
    (mdb/setup-db! :create-sample-content? true))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (if (empty? to-key)
    (mdb/decrypt-db (mdb/db-type) (mdb/data-source))
    (mdb/encrypt-db (mdb/db-type) (mdb/data-source) to-key)))
