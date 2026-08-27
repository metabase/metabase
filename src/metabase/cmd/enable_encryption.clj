(ns metabase.cmd.enable-encryption
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]))

(defn enable-encryption!
  "Encrypts the current configured db with the key in the `MB_ENCRYPTION_SECRET_KEY` env var. This is the only path
  that turns existing plaintext rows into ciphertext: startup refuses to run while the key is set but the database is
  not encrypted with it, so that a planted plaintext row can never be encrypted without an admin asking for it."
  []
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to encryption")
    (mdb/setup-db! :create-sample-content? true :check-encryption? false))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (case (mdb/encryption-check-status)
    :valid   (log/info "Database is already encrypted with MB_ENCRYPTION_SECRET_KEY; nothing to do.")
    :invalid (throw (ex-info "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" {}))
    :absent  (mdb/encrypt-db (mdb/db-type) (mdb/data-source) nil)))
