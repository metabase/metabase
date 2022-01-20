(ns metabase.cmd.rotate-encryption-key
  (:require [cheshire.core :as json]
            [clojure.java.jdbc :as jdbc]
            [metabase.db :as mdb]
            [metabase.db.connection :as mdb.conn]
            [metabase.models :refer [Database Secret Setting]]
            [metabase.models.setting.cache :as cache]
            [metabase.util.encryption :as encrypt]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn rotate-encryption-key!
  "Rotate the current configured db using the current MB_ENCRYPTION_SECRET_KEY env var and `to-key` argument."
  [to-key]
  (mdb/setup-db!)
  (let [make-encrypt-fn   (fn [maybe-encrypt-fn]
                            (if to-key
                              (partial maybe-encrypt-fn (encrypt/validate-and-hash-secret-key to-key))
                              identity))
        encrypt-str-fn    (make-encrypt-fn encrypt/maybe-encrypt)
        encrypt-bytes-fn  (make-encrypt-fn encrypt/maybe-encrypt-bytes)]
    (jdbc/with-db-transaction [t-conn (mdb.conn/jdbc-spec)]
      (doseq [[id details] (db/select-id->field :details Database)]
        (when (encrypt/possibly-encrypted-string? details)
          (throw (ex-info (trs "Can't decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
        (jdbc/update! t-conn
                      :metabase_database
                      {:details (encrypt-str-fn (json/encode details))}
                      ["metabase_database.id = ?" id]))
      (doseq [[key value] (db/select-field->field :key :value Setting)]
        (if (= key "settings-last-updated")
          (cache/update-settings-last-updated!)
          (jdbc/update! t-conn
                        :setting
                        {:value (encrypt-str-fn value)}
                        ["setting.key = ?" key])))
      ;; update all secret values according to the new encryption key
      ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
      ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
      ;; of whether they are the "current version" or not), should be updated with the new key
      (doseq [[id value] (db/select-id->field :value Secret)]
        (when (encrypt/possibly-encrypted-string? value)
          (throw (ex-info (trs "Can't decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
        (jdbc/update! t-conn
          :secret
          {:value (let [v (encrypt-bytes-fn value)]
                    v)}
          ["secret.id = ?" id])))))
