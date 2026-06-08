(ns metabase.public-sharing.unlock
  "Shared unlock primitives for password-gated public links.

  Provides:
  - Constant-time password verification against the encrypted column
  - HMAC-signed cookie helpers for storing unlock receipts
  - Throttle for brute-force protection keyed on [entity-type uuid]"
  (:require
   [buddy.core.bytes :as bytes]
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [buddy.core.mac :as mac]
   [environ.core :as env]
   [metabase.util.json :as json]
   [ring.util.response :as response]
   [throttle.core :as throttle])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Password verify --------------------------------------------------

(defn verify-password
  "Constant-time comparison of `candidate` against the stored (already-decrypted) `stored-password`.
  Returns true when they match. Both must be non-nil strings."
  [candidate stored-password]
  (when (and (some? candidate) (some? stored-password))
    (bytes/equals? (.getBytes ^String candidate "UTF-8")
                   (.getBytes ^String stored-password "UTF-8"))))

(defn password-hash
  "Return a short (8 hex char) hash of `password`, used inside cookie entries so that a password change
  by an admin automatically invalidates existing unlock cookies."
  ^String [^String password]
  (subs (codecs/bytes->hex (buddy-hash/sha256 password)) 0 8))

;;; ---------------------------------------------------- Throttle -----------------------------------------------------

(def unlock-throttle
  "Rate limiter for unlock attempts, keyed on `\"<entity-type>/<uuid>\"`."
  (throttle/make-throttler :unlock-key
                           :attempts-threshold 10
                           :initial-delay-ms   500
                           :attempt-ttl-ms     60000
                           :delay-exponent     2))

(defn throttle-key
  "Build the throttle key string from an entity type keyword and uuid string."
  [entity-type uuid]
  (str (name entity-type) "/" uuid))

;;; ------------------------------------------------- Signed cookie ----------------------------------------------------

(def ^:private cookie-name "metabase.PUBLIC_UNLOCK")
(def ^:private max-entries 50)
(def ^:private entry-ttl-seconds (* 7 24 60 60)) ;; 7 days

(defn- hmac-key
  "Derive the HMAC signing key. Uses MB_ENCRYPTION_SECRET_KEY when available, falls back to a static key
  (acceptable because the cookie only gates public content, not authenticated data)."
  ^String []
  (or (env/env :mb-encryption-secret-key)
      "metabase-public-unlock-default-key"))

(defn- hmac-sign
  "HMAC-SHA256 sign `message`, returning a hex string."
  ^String [^String message]
  (let [key-bytes (.getBytes ^String (str (hmac-key)) "UTF-8")]
    (-> (mac/hash message {:key key-bytes :alg :hmac+sha256})
        (codecs/bytes->hex))))

(defn- hmac-verify
  "Constant-time verify that `signature` matches `message`."
  [^String message ^String signature]
  (let [expected (hmac-sign message)]
    (bytes/equals? (.getBytes ^String expected "UTF-8")
                   (.getBytes ^String signature "UTF-8"))))

(defn- now-epoch-seconds []
  (.getEpochSecond (Instant/now)))

(defn- encode-cookie-value
  "Encode `entries` as a signed cookie value: `<base64-payload>.<hex-signature>`."
  [entries]
  (let [payload (json/encode entries)
        sig     (hmac-sign payload)]
    (str payload "." sig)))

(defn- decode-cookie-value
  "Parse and verify a cookie value. Returns the entries vector on success, nil on failure."
  [^String cookie-value]
  (when (string? cookie-value)
    (let [dot-idx (.lastIndexOf cookie-value ".")]
      (when (pos? dot-idx)
        (let [payload   (subs cookie-value 0 dot-idx)
              signature (subs cookie-value (inc dot-idx))]
          (when (hmac-verify payload signature)
            (try
              (json/decode+kw payload)
              (catch Exception _
                nil))))))))

(defn- prune-expired
  "Remove entries whose `exp` is in the past."
  [entries]
  (let [now (now-epoch-seconds)]
    (filterv #(> (:exp %) now) entries)))

(defn- cap-entries
  "Keep at most `max-entries`, evicting oldest (first) entries."
  [entries]
  (if (> (count entries) max-entries)
    (vec (take-last max-entries entries))
    entries))

(defn- read-cookie-entries
  "Read and decode the unlock cookie entries from the request. Returns [] if absent or invalid."
  [request]
  (let [raw (get-in request [:cookies cookie-name :value])]
    (or (some-> raw decode-cookie-value prune-expired) [])))

(defn unlocked?
  "Returns true if the request's unlock cookie contains a valid, non-expired entry for `entity-type` and `uuid`
  whose `pwd_hash` matches the current password."
  [request entity-type uuid current-password]
  (let [entries     (read-cookie-entries request)
        et-name     (name entity-type)
        current-hash (password-hash current-password)]
    (some (fn [{:keys [entity pwd_hash] e-uuid :uuid}]
            (and (= entity et-name)
                 (= e-uuid uuid)
                 (= pwd_hash current-hash)))
          entries)))

(defn- cookie-options
  "Cookie attributes for the unlock receipt."
  []
  {:http-only true
   :same-site :none
   :secure    true
   :path      "/api/public"})

(defn add-unlock-entry
  "Add an unlock entry for `entity-type`/`uuid` to the response cookie, reading existing entries from the request.
  Includes a short hash of `password` so the cookie is invalidated if the password changes.
  Caps at ~50 entries with FIFO eviction."
  [request response entity-type uuid password]
  (let [existing (read-cookie-entries request)
        ;; Remove any existing entry for same entity+uuid to avoid duplicates
        filtered (filterv (fn [{:keys [entity] e-uuid :uuid}]
                            (not (and (= entity (name entity-type))
                                      (= e-uuid uuid))))
                          existing)
        new-entry {:entity   (name entity-type)
                   :uuid     uuid
                   :exp      (+ (now-epoch-seconds) entry-ttl-seconds)
                   :pwd_hash (password-hash password)}
        entries  (-> (conj filtered new-entry) cap-entries)]
    (response/set-cookie response cookie-name (encode-cookie-value entries) (cookie-options))))
