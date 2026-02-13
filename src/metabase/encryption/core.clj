(ns metabase.encryption.core
  "High-level encryption operations: key rotation, encryption setup, and settings migration.

  For low-level encryption primitives (encrypt, decrypt, stream encryption, key hashing) use
  [[metabase.encryption.impl]] directly."
  (:require
   [metabase.encryption.impl :as encryption.impl]
   [metabase.encryption.migrate-encrypted-settings :as encryption.migrate-encrypted-settings]
   [metabase.encryption.rotation :as encryption.rotation]
   [metabase.encryption.spec :as encryption.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.string :as string]
   [potemkin :as p]
   [toucan2.core :as t2]))

(comment encryption.spec/keep-me)

(p/import-vars
 [encryption.migrate-encrypted-settings
  migrate-encrypted-settings!]

 [encryption.rotation
  decrypt-db
  encrypt-db]

 [encryption.spec
  encryption-spec])

(defn check-encryption-setup!
  "Ensure the encryption env variable is correctly set if needed, and encrypt the database if it needs to be.
   Called during DB setup after migrations have run.

   Encryption status is tracked by an `encryption-check` value in the settings table.
   NOTE: the encryption-check setting is not managed like most settings with `defsetting` so we can
   manage checking the raw values in the database."
  [db-type data-source]
  (let [raw (try (t2/select-one-fn :value :setting :key "encryption-check")
                 (catch Throwable e (log/warn e "Error checking encryption status, assuming unencrypted")))
        looks-encrypted (not= raw "unencrypted")]
    (log/debug "Checking encryption configuration")
    (when-not (nil? raw)
      (if looks-encrypted
        (do
          (when-not (encryption.impl/default-encryption-enabled?)
            (throw (ex-info "Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment variable was NOT set" {})))
          (when-not (string/valid-uuid? (encryption.impl/maybe-decrypt raw))
            (throw (ex-info "Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains" {})))
          (log/debug "Database encrypted and MB_ENCRYPTION_SECRET_KEY correctly configured"))
        (if (encryption.impl/default-encryption-enabled?)
          (do
            (log/info "New MB_ENCRYPTION_SECRET_KEY environment variable set. Encrypting database...")
            (encrypt-db db-type data-source nil)
            (log/info "Database encrypted..." (u/emoji "✅")))
          (log/debug "Database not encrypted and MB_ENCRYPTION_SECRET_KEY env variable not set."))))))
