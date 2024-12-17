(ns metabase.encryption
  (:require
   [metabase.db :as mdb]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.public-settings :as public-settings]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn encrypt
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data, and passed `to-key` to re-encrypt.
  If no to-key is passed, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value.
  If passed to-key is empty string, it decrypts the entire database"
  ([] (encrypt nil))
  ([to-key]
   (let [make-encrypt-fn (fn [maybe-encrypt-fn]
                           (cond
                             (nil? to-key) maybe-encrypt-fn
                             (empty? to-key) identity
                             :else (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))))
         encrypt-str-fn (make-encrypt-fn encryption/maybe-encrypt)
         encrypt-bytes-fn (make-encrypt-fn encryption/maybe-encrypt-bytes)]
     (t2/with-transaction [t-conn {:datasource (mdb/app-db)}]
       (doseq [[id details] (t2/select-pk->fn :details :model/Database)]
         (when (encryption/possibly-encrypted-string? details)
           (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
         (t2/update! :conn t-conn :metabase_database
                     {:id id}
                     {:details (encrypt-str-fn (json/encode details))}))
       (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
         (if (= key "settings-last-updated")
           (setting.cache/update-settings-last-updated!)
           (t2/update! :conn t-conn :setting
                       {:key key}
                       {:value (encrypt-str-fn value)})))
        ;; update all secret values according to the new encryption key
        ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
        ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
        ;; of whether they are the "current version" or not), should be updated with the new key
       (doseq [[id value] (t2/select-pk->fn :value :model/Secret)]
         (when (encryption/possibly-encrypted-string? value)
           (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
         (t2/update! :conn t-conn :secret
                     {:id id}
                     {:value (encrypt-bytes-fn value)}))))))

(defn setup-encryption
  "Ensure encryption env variable is correctly set if needed, and encrypt the database if it needs to be"
  []
  (public-settings/site-uuid-for-version-info-fetching) ; ensure value is set
  (let [raw (-> (t2/select-one "setting" :key "site-uuid-for-version-info-fetching") ; can't use :model/setting to avoid auto-decryption
                :value)
        decoded-value (encryption/maybe-decrypt raw)]
    (log/info "Checking encryption configuration")
    (if (= decoded-value raw)
      (if (string/valid-uuid? raw)
        (if (encryption/default-encryption-enabled?)
          (do
            (log/info "New MB_ENCRYPTION_SECRET_KEY environment variable set. Encrypting database...")
            (encrypt)
            (log/info "Encrypting database...done"))
          (log/info "Database not encrypted and MB_ENCRYPTION_SECRET_KEY env variable not set."))
        (if (encryption/default-encryption-enabled?)
          (throw (ex-info "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" {}))
          (throw (ex-info "Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment variable was NOT set" {}))))
      (if (string/valid-uuid? decoded-value)
        (log/info "Database encrypted and MB_ENCRYPTION_SECRET_KEY correctly configured")
        (throw (Exception. "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains"))))))
