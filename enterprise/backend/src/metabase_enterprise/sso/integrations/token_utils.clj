(ns metabase-enterprise.sso.integrations.token-utils
  "Functions for handling validation tokens when working with SDK calls"
  (:require [metabase-enterprise.sso.integrations.sso-settings :refer [sdk-encryption-validation-key]]
            [metabase.util.encryption :as encryption]))

(defn- current-timestamp []
  "Get the current Unix timestamp in seconds"
  (str (quot (System/currentTimeMillis) 1000)))

(defn generate-token
  "Generate a cryptographically secure token with built-in expiration."
  []
  (let [timestamp (current-timestamp)
        expiration (str (+ (Long/parseLong timestamp) 300))
        nonce (str (java.util.UUID/randomUUID))
        payload (str timestamp "." expiration "." nonce)
        hashed-key (encryption/secret-key->hash (sdk-encryption-validation-key))
        encrypted-payload (encryption/encrypt hashed-key payload)]
    encrypted-payload))

(defn validate-token
  "Validate that a token is authentic and not expired."
  [token]
  (when token
    (try
      (let [hashed-key (encryption/secret-key->hash (sdk-encryption-validation-key))
            decrypted-payload (encryption/decrypt hashed-key token)
            [timestamp expiration nonce] (clojure.string/split decrypted-payload #"\." 3)
            current-time (Long/parseLong (current-timestamp))]
        (< current-time (Long/parseLong expiration)))
      (catch Exception _
        false))))

(defn- get-token-from-header
  "Extract the token from the request headers"
  [request]
  (get-in request [:headers "x-metabase-sdk-jwt-hash"] nil))

(defn with-token
  "Add a newly generated token to a response"
  [response]
  (assoc response :hash (generate-token)))

(defn has-token
  "Check if a request has a valid token"
  [request]
  (let [token (get-token-from-header request)]
    (if token
      (validate-token token)
      false)))