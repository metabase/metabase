(ns metabase.db.encryption
  (:require
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn encrypt-db
  "Encrypt the db using the current `MB_ENCRYPTION_SECRET_KEY` to read data, and the passed `to-key` to re-encrypt.
  If passed to-key is nil, it encrypts with the current MB_ENCRYPTION_SECRET_KEY value.
  If passed to-key is empty string, it decrypts the entire database"
  [db-type data-source to-key]
  (let [make-encrypt-fn (fn [maybe-encrypt-fn]
                          (cond
                            (nil? to-key) maybe-encrypt-fn
                            (empty? to-key) identity
                            :else (partial maybe-encrypt-fn (encryption/validate-and-hash-secret-key to-key))))
        encrypt-str-fn (make-encrypt-fn encryption/maybe-encrypt)
        encrypt-bytes-fn (make-encrypt-fn encryption/maybe-encrypt-bytes)]
    (t2/with-transaction [_conn {:datasource data-source}]
      (doseq [[id details] (t2/select-pk->fn :details :model/Database)]
        (when (encryption/possibly-encrypted-string? details)
          (throw (ex-info (trs "Can''t decrypt app db with MB_ENCRYPTION_SECRET_KEY") {:database-id id})))
        (t2/update! :conn _conn :metabase_database
                    {:id id}
                    {:details (encrypt-str-fn (json/encode details))}))
      (doseq [[key value] (t2/select-fn->fn :key :value :model/Setting)]
        (case key
          "settings-last-updated" (let [current-timestamp-as-string-honeysql (h2x/cast (if (= db-type :mysql) :char :text)
                                                                                       [:raw "current_timestamp"])]
                                    (t2/update! :conn _conn :setting {:key key} {:value current-timestamp-as-string-honeysql}))
          "encryption-check" (t2/update! :conn _conn :setting {:key key} {:value (if (= "" to-key) "unencrypted" (encrypt-str-fn (str (java.util.UUID/randomUUID))))})
          (t2/update! :conn _conn :setting
                      {:key key}
                      {:value (encrypt-str-fn value)})))
                         ;; update all secret values according to the new encryption key
                         ;; fortunately, we don't need to fetch the latest secret instance per ID, as we would need to in order to update
                         ;; a secret value through the regular database save API path; instead, ALL secret values in the app DB (regardless
                         ;; of whether they are the "current version" or not), should be updated with the new key
      (doseq [[id value] (t2/select-pk->fn :value :model/Secret)]
        (when (encryption/possibly-encrypted-string? value)
          (throw (ex-info (trs "Can''t decrypt secret value with MB_ENCRYPTION_SECRET_KEY") {:secret-id id})))
        (t2/update! :conn _conn :secret
                    {:id id}
                    {:value (encrypt-bytes-fn value)})))))
