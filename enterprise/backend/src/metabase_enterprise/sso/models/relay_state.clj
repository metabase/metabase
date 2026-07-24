(ns metabase-enterprise.sso.models.relay-state
  "Server-side store for the SAML SSO `RelayState` context.
  The key itself is the single-use, expiring proof that the callback belongs to a login we started, so no
  separate token is needed. Like session keys, the plaintext key lives only in the SAML `RelayState` that
  round-trips through the IdP — the DB stores and is looked up by its SHA-512 hash, so a read of the table
  can't reveal in-flight keys."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.util.random :as random]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/SsoRelayState [_model] :sso_relay_state)

(doto :model/SsoRelayState
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(def ^:private key-prefix
  "Prefix for generated RelayState keys. The trailing `_` is not part of the Base64 alphabet, so a stored
  key can never be mistaken for a Base64-encoded continue URL (the legacy, non-embedding RelayState format)."
  "mbsso_")

(def ^:private ttl-seconds
  "How long a RelayState entry is valid for — i.e. the maximum time allowed between starting a login
  (redirect to the IdP) and the IdP posting back. Generous, since a user may spend a while authenticating
  at their IdP; the SAML assertion's own validity window is the real freshness gate."
  (* 30 60))

(defn relay-state-key?
  "Is `relay-state` one of our generated keys (vs. a legacy Base64-encoded continue URL)?"
  [relay-state]
  (boolean (and relay-state (str/starts-with? relay-state key-prefix))))

(defn- hash-key
  "One-way SHA-512 hash (hex) of a RelayState `key`, used as the stored/looked-up primary key. The plaintext
  key is high-entropy random, so a fast hash is sufficient (cf. [[metabase.session.models.session]])."
  ^String [^String key]
  (codecs/bytes->hex (buddy-hash/sha512 (.getBytes key StandardCharsets/UTF_8))))

(defn generate-key
  "Generate a fresh opaque RelayState key — 16 bytes (128 bits) of cryptographically secure randomness behind
  the [[key-prefix]]. The key is the unguessable proof that ties an IdP callback to a login we initiated. It
  is generated before the SAML AuthnRequest (which embeds it) and only [[persist!]]ed once that succeeds."
  ^String []
  (str key-prefix (random/secure-hex 16)))

(defn persist!
  "Persist the SAML callback `context` under its already-generated `:id` (from [[generate-key]]). Returns the id.

  `context` keys:
  - `:id`           - the RelayState key (see [[generate-key]]); stored hashed, never in plaintext
  - `:continue-url` - where to send the user after login (redirect target, or popup fallback URL)
  - `:origin`       - postMessage target origin (embedding popup only)
  - `:embedding?`   - whether this is a modular-embedding popup login"
  [{:keys [id continue-url origin embedding?]}]
  (t2/insert! :model/SsoRelayState
              {:id           (hash-key id)
               :continue_url continue-url
               :origin       origin
               :embedding    (boolean embedding?)
               :expires_at   (t/plus (t/offset-date-time) (t/seconds ttl-seconds))})
  id)

(defn find-unexpired
  "Return the stored, unexpired RelayState row for the (plaintext) `key`, or `nil`. Look-up only — it does NOT
  delete the entry. The entry is consumed via [[delete!]] only after the login succeeds, so a failed or
  retried callback doesn't burn the key."
  [key]
  (when (relay-state-key? key)
    (t2/select-one :model/SsoRelayState :id (hash-key key) :expires_at [:> (t/offset-date-time)])))

(defn delete!
  "Consume (delete) the RelayState entry for the (plaintext) `key`. Called after a successful login; the single
  `DELETE` is atomic and idempotent (a concurrent or replayed callback that loses the race simply deletes
  nothing)."
  [key]
  (when (relay-state-key? key)
    (t2/delete! :model/SsoRelayState :id (hash-key key))))

(defn delete-expired!
  "Delete all expired RelayState entries (abandoned logins that never came back). Returns the number deleted."
  []
  (t2/delete! :model/SsoRelayState :expires_at [:<= (t/offset-date-time)]))
