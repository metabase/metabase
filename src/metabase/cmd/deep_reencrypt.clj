(ns metabase.cmd.deep-reencrypt
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]))

(defn deep-reencrypt!
  "Rewrite every encrypted value under the newest DEK generation and delete all retired DEK rows, so old key material
  is fully retired. Requires `MB_ENCRYPTION_SECRET_KEY` to be set and correct for this database."
  []
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to deep re-encryption")
    (mdb/setup-db! :create-sample-content? true))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (mdb/deep-reencrypt-db! (mdb/db-type) (mdb/data-source)))
