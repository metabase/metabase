(ns metabase.cmd.enable-encryption
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn enable-encryption!
  "Encrypts the current configured db with the key in the `MB_ENCRYPTION_SECRET_KEY` env var. This is the only path
  that turns existing plaintext rows into ciphertext: startup refuses to run while the key is set but the database is
  not encrypted with it, so that existing rows are only ever encrypted when an admin explicitly asks for it."
  []
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to encryption")
    (mdb/setup-db! :create-sample-content? true :manage-encryption-state? false))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (if (= :valid (mdb/encryption-check-status))
    (log/info "Database is already encrypted with MB_ENCRYPTION_SECRET_KEY; nothing to do.")
    ;; an :invalid sentinel makes encrypt-db abort before touching any row
    (mdb/encrypt-db (mdb/db-type) (mdb/data-source) nil)))
