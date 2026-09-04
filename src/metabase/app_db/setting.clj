(ns metabase.app-db.setting
  "How the application DB stores a setting's value: `setting.value_with_aad` holds it encrypted under additional
  authenticated data naming the setting (and `setting.value_sysadmin`, a sysadmin-only setting's host-configured
  value, under its own AAD), so that a value moved between rows -- whose ciphertext alone says nothing
  about which setting it belongs to -- fails to decrypt. The legacy `value` column holds it bare, for versions that
  predate the other. Lives here rather than with the Setting model because the encryption tooling here writes two rows
  the model never does: the `settings-last-updated` marker and the `encryption-check` sentinel."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.app-db.db :as mdb.db]
   [metabase.util.encryption :as encryption]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^{:arglists '(^bytes [setting-key])} setting-aad
  "The additional authenticated data a setting's value is encrypted under: `setting.<key>`."
  (memoize (fn ^bytes [setting-key] (codecs/to-bytes (str "setting." setting-key)))))

(def ^{:arglists '(^bytes [setting-key])} sysadmin-setting-aad
  "The additional authenticated data a sysadmin-only setting's `value_sysadmin` is encrypted under: `sysadmin.<key>`.
  Distinct from [[setting-aad]] so a `value_with_aad` ciphertext cannot be moved into the sysadmin column."
  (memoize (fn ^bytes [setting-key] (codecs/to-bytes (str "sysadmin." (name setting-key))))))

(defn sysadmin-aad-opts
  "The `metabase.util.encryption` opts binding a `setting.value_sysadmin` ciphertext to `setting-key`'s row -- the one
  place that pairing is spelled out, so every reader and writer of the column agrees on it."
  [setting-key]
  {:aad (sysadmin-setting-aad setting-key)})

(defn migrate-settings!
  "Give every setting row that has no `value_with_aad` one, from the legacy `value` column beside it, stored the way
  the Setting model stores one. Runs from `metabase.app-db.setup/setup-db!` after migrations and before anything reads
  a setting, whenever the database's encryption state says every row can be read -- a row this cannot decrypt would
  otherwise be stored as if it were a value.

  Only an empty `value_with_aad` is filled in: a row a version predating the column wrote, on the first start after
  the upgrade or while such a version runs alongside this one. A row that has one is left exactly as it is, whatever
  `value` says beside it -- nothing in this version reads `value`, and a version that does reconciles it at its own
  startup.

  Whether a `value` is encrypted is decided by decrypting it, never by its shape: a plaintext value that merely looks
  like ciphertext is a value too. Reads and writes the table directly, never through the model: the model's read is
  the strict one this fills in for, and the cloud-migration guard on Toucan DML reads `read-only-mode` through it
  before every update -- a row that may itself be among those being filled in."
  []
  (let [filled (atom 0)]
    (t2/with-transaction [_conn]
      (doseq [{:keys [key value]} (mdb.db/unmigrated-settings)
              :let  [plain (if (encryption/decryptable-string? value) (encryption/decrypt value) value)]]
        (swap! filled inc)
        (mdb.db/update-setting-values! key {:value_with_aad (encryption/maybe-encrypt plain {:aad (setting-aad key)})})))
    (when (pos? @filled)
      (log/infof "Filled in the authenticated value of %d setting(s) from their value." @filled))))
