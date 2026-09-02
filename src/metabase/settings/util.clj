(ns metabase.settings.util
  "The JSON envelope a `setting` row stores its value in: `{\"setting-key\": ..., \"setting-value\": ...}`, held in the
  row's `details` column and encrypted whole when the setting is encrypted at rest.

  Storing the key alongside the value is what lets a read reject a value that has been moved between rows: on its own
  a stored value says nothing about which setting it belongs to, and for an encrypted setting neither does its
  ciphertext, so a direct DB write could otherwise give one setting another's value. The field names are prefixed so
  that no value carried over from elsewhere -- a JSON setting whose own content happens to have a `key` field, say --
  can pass for an envelope.

  Lives here, rather than with the Setting model, because the two rows the model never writes -- the
  `settings-last-updated` marker and the `encryption-check` sentinel -- are written by namespaces the model is built
  on top of."
  (:require
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn wrap-value
  "Serialize `value` into the envelope stored against `setting-key`."
  ^String [setting-key value]
  (json/encode {:setting-key setting-key, :setting-value value}))

(defn unwrap-value
  "Take the stored value back out of the envelope written by [[wrap-value]], checking that it was written against
  `setting-key`. Throws if `stored` is not an envelope, or is an envelope belonging to another setting. The messages
  name the setting and never the value, which may be a secret."
  [setting-key ^String stored]
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

(defn details
  "What a setting row stores in its `details` column for `value`: the [[wrap-value]] envelope, encrypted with
  `encrypt` -- by default [[encryption/maybe-encrypt]], so ciphertext whenever MB_ENCRYPTION_SECRET_KEY is set and
  plaintext otherwise. Key rotation passes the function that encrypts under the key it is rotating to."
  (^String [setting-key value]
   (details setting-key value encryption/maybe-encrypt))
  (^String [setting-key value encrypt]
   (encrypt (wrap-value setting-key value))))
