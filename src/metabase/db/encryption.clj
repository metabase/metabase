(ns metabase.db.encryption
  (:require
   [metabase.models.interface :as mi]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- do-encryption
  "Encrypt or decrypts the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data.

  The passed make-encrypt-fn is used to generate the encryption/decryption function to use by passing versions of encryption/maybe-encrypt to it."
  [db-type data-source encrypting?]
  (with-redefs [mi/transform-encrypted-json {:in  #'mi/encrypted-json-in
                                             :out #'mi/encrypted-json-out}]
    (t2/with-transaction [conn {:datasource data-source}]
      (doseq [[id details] (t2/select-pk->fn :details :model/Database)]
        (when (encryption/possibly-encrypted-string? details)
          (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
        (t2/update! :conn conn :model/Database
          {:id id}
          {:details details}))
      (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                               [:raw "current_timestamp"])]
                                    (t2/update! :conn conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" (t2/update! :conn conn :model/Setting {:key key} {:value (if encrypting? (encryption/maybe-encrypt (str (random-uuid))) "unencrypted")})
          (t2/update! :conn conn :model/Setting
            {:key key}
            {:value value})))
      ;; update all secret values according to the new encryption key
      ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
      ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
      ;; of whether they are the "current version" or not), should be updated with the new key
      (doseq [[id value] (t2/select-pk->fn :value :model/Secret)]
        (when (encryption/possibly-encrypted-string? value)
          (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
        (t2/update! :conn conn :model/Secret
          {:id id}
          {:value value}))
      (t2/delete! :conn conn :model/QueryCache)
      (doseq [{:keys [id values human-readable-values]} (t2/select [:model/FieldValues :id :values :human_readable_values])]
        (when (encryption/possibly-encrypted-string? values)
          (throw (ex-info (trs "Can''t decrypt field values with MB_ENCRYPTION_SECRET_KEY") {:field-value-id id})))
        (when (encryption/possibly-encrypted-string? human-readable-values)
          (throw (ex-info (trs "Can''t decrypt field mappings with MB_ENCRYPTION_SECRET_KEY") {:field-value-id id})))
        (t2/update! :conn conn :model/FieldValues
          {:id id}
          {:values                values
           :human_readable_values human-readable-values})))))

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value."
  [db-type data-source to-key]
  (when (and (not (nil? to-key)) (empty? to-key))
    (throw (ex-info "Cannot encrypt database with an empty key" {})))
  (if (nil? to-key)
    (do-encryption db-type data-source true)
    (binding [encryption/*default-encryption-key* (encryption/validate-and-hash-secret-key to-key)]
      (do-encryption db-type data-source true))))

(defn decrypt-db
  "Decrypts the database using the current `MB_ENCRYPTION_SECRET_KEY` to read existing data"
  [db-type data-source]
  (binding [encryption/*default-encryption-key* nil]
    (do-encryption db-type data-source false)))
