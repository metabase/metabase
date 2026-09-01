(ns metabase-enterprise.sso.integrations.token-utils
  "Functions for handling validation tokens when working with SDK calls"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.util.encryption :as encryption])
  (:import
   (java.net URLEncoder URLDecoder)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private token-source
  "Binds an SDK validation token to this use, so no other encrypted value can be presented as one (or the reverse).
  Tokens live 300 seconds, so ones issued before this existed have long expired."
  :encryption/sso.sdk-token)

(defn- hashed-key
  []
  (encryption/secret-key->hash (sso-settings/sdk-encryption-validation-key)))

(defn generate-token
  "Generate a cryptographically secure token with built-in expiration."
  ^String []
  (let [timestamp  (t/instant)
        expiration (t/instant (t/plus timestamp (t/seconds 300)))
        nonce      (random-uuid)
        payload    (str (.getEpochSecond timestamp) "." (.getEpochSecond expiration) "." nonce)
        encrypted  (encryption/encrypt payload token-source {:secret-key (hashed-key)})]
    (URLEncoder/encode encrypted "UTF-8")))

(defn validate-token
  "Validate that a token is authentic and not expired."
  [token]
  (boolean
   (and token
        (not-empty token)
        (try
          (let [decoded-token     (URLDecoder/decode ^String token "UTF-8")
                decrypted-payload (encryption/decrypt decoded-token token-source {:secret-key (hashed-key)})
                [_ expiration _]  (str/split decrypted-payload #"\." 3)]
            (t/< (t/instant) (Instant/ofEpochSecond (Long/parseLong expiration))))
          (catch Exception _
            false)))))
