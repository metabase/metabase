(ns metabase.app-db.setting
  "The JSON envelope a `setting` row stores its value in: `{\"setting-key\": ..., \"setting-value\": ...}`, held in the
  row's `details` column and encrypted whole when the setting is encrypted at rest.

  Storing the key alongside the value is what lets a read reject a value that has been moved between rows: on its own
  a stored value says nothing about which setting it belongs to, and for an encrypted setting neither does its
  ciphertext, so a direct DB write could otherwise give one setting another's value. The field names are prefixed so
  that no value carried over from elsewhere -- a JSON setting whose own content happens to have a `key` field, say --
  can pass for an envelope.

  Lives with the application DB rather than with the Setting model because the two rows the model never writes --
  the `settings-last-updated` marker and the `encryption-check` sentinel -- are written by the encryption tooling
  here, which the model is built on top of."
  (:require
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn wrap-value :- :string
  "Serialize `value` into the envelope stored against `setting-key`. Only a string goes in: the column used to flatten
  everything to text, and a getter reading a number or boolean back out of JSON would fail far from the write that
  put it there."
  [setting-key :- :string
   value       :- :string]
  (json/encode {:setting-key setting-key, :setting-value value}))

(mu/defn unwrap-value :- :string
  "Take the stored value back out of the envelope written by [[wrap-value]], checking that it was written against
  `setting-key`. Throws if `stored` is not an envelope, or is an envelope belonging to another setting. The messages
  name the setting and never the value, which may be a secret."
  [setting-key :- :string
   stored      :- :string]
  (let [envelope (try
                   (json/decode stored)
                   (catch Throwable e
                     (throw (ex-info (format "Setting \"%s\" is not stored as JSON" setting-key)
                                     {:setting-key setting-key}
                                     e))))]
    (when-not (map? envelope)
      (throw (ex-info (format "Setting \"%s\" is not stored as a JSON object" setting-key)
                      {:setting-key setting-key})))
    (let [stored-key (get envelope "setting-key")]
      (when-not (= stored-key setting-key)
        (throw (ex-info (format "Setting \"%s\" is stored under the key \"%s\"" setting-key stored-key)
                        {:setting-key setting-key, :stored-key stored-key}))))
    (get envelope "setting-value")))

(mu/defn wrap-value-maybe-encrypt :- :string
  "What a setting row stores in its `details` column for `value`: the [[wrap-value]] envelope, encrypted whenever
  MB_ENCRYPTION_SECRET_KEY is set and plaintext otherwise."
  [setting-key :- :string
   value       :- :string]
  (encryption/maybe-encrypt (wrap-value setting-key value)))

(mu/defn- unwrap-value-maybe-decrypt :- [:maybe :string]
  "The value a row's `details` hold, or nil if they hold nothing readable: they are absent, they do not decrypt, or
  what comes out is not this setting's envelope. The lenient counterpart of [[wrap-value-maybe-encrypt]]: a plaintext
  envelope written before any key was set still compares equal to its `value` and is left for `enable-encryption`
  rather than rewritten here."
  [setting-key :- :string
   details     :- [:maybe :string]]
  (when (some? details)
    (u/ignore-exceptions
      (unwrap-value setting-key (encryption/maybe-decrypt-accepting-plaintext details)))))

(mu/defn migrate-settings! :- :nil
  "Bring every setting row's `details` back in line with the legacy `value` column beside it, stored the way the
  Setting model stores one. Runs from `metabase.app-db.setup/setup-db!` after migrations and before anything reads a
  setting, whenever the database's encryption state says every row can be read -- a row this cannot decrypt would
  otherwise be wrapped as if it were a value.

  Every write from the current version sets both columns, so the two agreeing is the normal state and nothing here
  has anything to do. They come apart only where a version predating `details` has written: it sets `value` alone,
  so a setting it added has no `details` at all and one it changed has `details` still holding the previous value --
  which the read would otherwise serve indefinitely, as a plausible older value rather than as an error. A rotation
  run from such a version is worse still: it rewrites `value` under the new key and leaves `details` encrypted under
  the old one, and a single row like that fails the whole settings cache restore rather than just its own setting.

  `value` therefore wins here, and only here: it is the column every version maintains, and the one an older version
  is already trusting. The model's read stays strict, so while the current version is running a value still has to
  arrive inside the envelope naming the setting it belongs to. `value` itself is never reconciled: nothing in the
  current version reads it, and a version that does reconciles it at its own startup.

  Reads and writes the table directly, never through the model: the model's read is the strict one this repairs for,
  and the cloud-migration guard on Toucan DML reads `read-only-mode` through it before every update -- a row that may
  itself be among those being repaired."
  []
  (let [repaired (atom 0)]
    (t2/with-transaction [_conn]
      (let [rows    (t2/select :setting {:for :update})
            ;; `contains?`, not the value: migrations can be run to a target that predates the column, and a row read
            ;; from a table without it simply has no such key
            column? (contains? (first rows) :details)]
        (doseq [{:keys [key value details]} (when column? rows)
                :when (seq value)
                ;; a `value` that looks encrypted but does not decrypt is no better than the details it would replace
                :let  [plain (u/ignore-exceptions (encryption/maybe-decrypt-accepting-plaintext value))]
                :when (and (some? plain) (not= plain (unwrap-value-maybe-decrypt key details)))]
          (swap! repaired inc)
          (t2/query {:update :setting
                     :set    {:details (wrap-value-maybe-encrypt key plain)}
                     :where  [:= :key key]}))))
    (when (pos? @repaired)
      (log/infof "Rebuilt the details of %d setting(s) from their value." @repaired))))
