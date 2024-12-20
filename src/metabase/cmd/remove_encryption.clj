(ns metabase.cmd.remove-encryption
  (:require
   [metabase.db :as mdb]
   [metabase.util.log :as log]))

(defn remove-encryption!
  "Removes the encryption from the current configured db.
   The current encryption key must be set in the `MB_ENCRYPTION_SECRET_KEY` env var."
  []
  (when-not (mdb/db-is-set-up?)
    (throw (Exception. "Not database configured")))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (mdb/encrypt-db (mdb/db-type) (mdb/data-source) ""))
