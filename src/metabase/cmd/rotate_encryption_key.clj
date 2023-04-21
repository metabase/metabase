(ns metabase.cmd.rotate-encryption-key
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [metabase.db :as mdb]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.env :as mdb.env]
   [metabase.models :refer [Database Secret Setting]]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn rotate-encryption-key!
  "Rotate the current configured db using the current `MB_ENCRYPTION_SECRET_KEY` env var and `to-key` argument."
  [to-key]
  (when-not (mdb/db-is-set-up?)
    (log/warnf "Database not found. Metabase will create a new database at %s and proceeed encrypting." "2")
    (mdb/setup-db!))
  (log/infof "%s: %s | %s" (trs "Connected to") mdb.env/db-type (mdb.env/db-file))
  (let [make-encrypt-fn   (fn [maybe-encrypt-fn]
                            (if to-key
                              (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))
                              identity))
        encrypt-str-fn    (make-encrypt-fn encryption/maybe-encrypt)
        encrypt-bytes-fn  (make-encrypt-fn encryption/maybe-encrypt-bytes)
        is-h2             (= :h2 (mdb/db-type))
        value-column      (if is-h2
                            "\"VALUE\""
                            :value)
        setting-where     (if is-h2
                            "setting.\"KEY\" = ?"
                            "setting.key = ?")]
    (t2/with-transaction [t-conn {:datasource (mdb.connection/data-source)}]
      (doseq [[id details] (t2/select-pk->fn :details Database)]
        (when (encryption/possibly-encrypted-string? details)
          (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
        (jdbc/update! {:connection t-conn}
                      :metabase_database
                      {:details (encrypt-str-fn (json/encode details))}
                      ["metabase_database.id = ?" id]))
      (doseq [[key value] (t2/select-fn->fn :key :value Setting)]
        (if (= key "settings-last-updated")
          (setting.cache/update-settings-last-updated!)
          (jdbc/update! {:connection t-conn}
                        :setting
                        {value-column (encrypt-str-fn value)}
                        [setting-where key])))
      ;; update all secret values according to the new encryption key
      ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
      ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
      ;; of whether they are the "current version" or not), should be updated with the new key
      (doseq [[id value] (t2/select-pk->fn :value Secret)]
        (when (encryption/possibly-encrypted-string? value)
          (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
        (jdbc/update! {:connection t-conn}
                      :secret
                      {value-column (encrypt-bytes-fn value)}
                      ["secret.id = ?" id])))))
