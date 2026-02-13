(ns metabase.encryption.migrate-encrypted-settings
  (:require
   [metabase.encryption.impl :as encryption.impl]
   [metabase.settings.core :as setting]
   [toucan2.core :as t2]))

(defn migrate-encrypted-settings!
  "We have some settings that may currently be encrypted in the database that we'd like to disable encryption for.
  This function just goes through all of them, checks to see if a value exists in the database, and re-saves it if
  so. Toucan will handle decryption on the way out (if necessary) and the new value won't be encrypted.

  Note that we're completely working around the standard getters/setters here. This should be fine in this case
  because:
  - we're only doing anything when a value exists in the database, and
  - we're setting the value to the exact same value that already exists - just a decrypted version."
  []
  ;; If we don't have an encryption key set, don't bother trying to decrypt anything. If stuff is encrypted in the DB,
  ;; we can't do anything about it (since we can't decrypt it). If stuff isn't decrypted in the DB, we have nothing to
  ;; do.
  (when (encryption.impl/default-encryption-enabled?)
    (let [settings (setting/keys-with-encryption-prohibited)]
      (t2/with-transaction [_conn]
        (doseq [{v :value k :key}
                (t2/select :setting {:for :update :where [:and
                                                          [:in :key settings]
                                                          ;; these are *definitely* decrypted already, let's not bother looking
                                                          [:not [:in :value ["true" "false"]]]]})
                :let [decrypted-v (encryption.impl/maybe-decrypt v)]
                :when (not= decrypted-v v)]
          (t2/update! :setting :key k {:value decrypted-v}))))))
