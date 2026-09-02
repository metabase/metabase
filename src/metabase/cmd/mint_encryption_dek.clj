(ns metabase.cmd.mint-encryption-dek
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.log :as log]))

(defn mint-encryption-dek!
  "Mint a new active DEK generation under the current `MB_ENCRYPTION_SECRET_KEY`. Instant: existing values keep
  decrypting under their older generations; only new writes use the new generation."
  []
  (when-not (mdb/db-is-set-up?)
    (log/info "Checking database configuration prior to minting a DEK")
    (mdb/setup-db! :create-sample-content? true))
  (log/infof "Connected to: %s | %s" (mdb/db-type) (mdb/db-file))
  (mdb/mint-new-dek! (mdb/db-type) (mdb/data-source)))
