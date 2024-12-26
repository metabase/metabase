(ns metabase.cmd.remove-encryption
  (:require
   [metabase.db :as mdb]
   [metabase.util.log :as log]))

(defn remove-encryption!
  "Removes the encryption from the current configured db.
   The current encryption key must be set in the `MB_ENCRYPTION_SECRET_KEY` env var."
  []
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to decryption")
    (mdb/setup-db! :create-sample-content? true))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (mdb/decrypt-db (mdb/db-type) (mdb/data-source)))
