(ns metabase.session.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [buddy.core.mac :as mac]
   [buddy.core.nonce :as nonce]
   [clojure.core.memoize :as memo]
   [environ.core :as env]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.session.settings :as session.settings]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- random-anti-csrf-token :- [:re {:error/message "valid anti-CSRF token"} #"^[0-9a-f]{32}$"]
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

;; validated eagerly at load so a misconfigured secret fails at startup instead of 500ing the first auth request
(defonce ^:private ^{:tag 'bytes} default-session-hash-secret
  (encryption/validate-and-hash-secret-key (env/env :mb-session-secret-key) "MB_SESSION_SECRET_KEY"))

(when-not *compile-files*
  (when-not default-session-hash-secret
    (log/warn (str "MB_SESSION_SECRET_KEY is not set; session keys are stored without a signature. Anyone with access"
                   " to the application database can forge a session and impersonate any user. Set it to a random"
                   " string of at least 16 characters to prevent this. Setting or changing it logs out all active"
                   " sessions."))))

(defn- session-hash-secret
  "Secret used to sign session keys before they are stored in or looked up from the app DB. Read from
  `MB_SESSION_SECRET_KEY`. Nil when it is not set."
  ^bytes []
  default-session-hash-secret)

(def ^:private ^{:arglists '([secret session-key])} hash-session-key*
  (memo/lru (fn [^bytes secret ^String session-key]
              (let [key-bytes (.getBytes session-key java.nio.charset.StandardCharsets/US_ASCII)]
                (codecs/bytes->hex
                 (if secret
                   (mac/hash key-bytes {:key secret :alg :hmac+sha512})
                   (buddy-hash/sha512 key-bytes)))))
            {} :lru/threshold 100))

(defn hash-session-key
  "Hash the session-key for storage in (and lookup from) the database.

  When `MB_SESSION_SECRET_KEY` is set the stored value is signed with that secret (HMAC-SHA512), so a valid
  `key_hashed` value cannot be computed with app-db (SQL) access alone. Without it this is a plain SHA-512."
  [session-key]
  (hash-session-key* (session-hash-secret) session-key))

(defn generate-session-key
  "Generate a new session key."
  []
  (str (random-uuid)))

(defn generate-session-id
  "Generate a new id for the session table."
  []
  (string/random-string 12))

(methodical/defmethod t2/table-name :model/Session [_model] :core_session)

(doto :model/Session
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-before-update :model/Session [_model]
  (throw (RuntimeException. "You cannot update a Session.")))

(t2/define-before-insert :model/Session
  [{session-key :session_key :as session}]
  (when (or (uuid? (:id session)) (string/valid-uuid? (:id session)))
    (throw (ex-info "Session id should not be stored plaintext in the session table." {})))
  (when (or (uuid? (:key_hashed session)) (string/valid-uuid? (:key_hashed session)))
    (throw (ex-info "Session key should not be stored plaintext in the session table." {})))
  ;; Check auth identity provider if provided
  (when-let [auth-identity-id (:auth_identity_id session)]
    (when-let [auth-identity (t2/select-one [:model/AuthIdentity :provider] :id auth-identity-id)]
      (when (and (= "password" (:provider auth-identity))
                 (not (session.settings/enable-password-login)))
        (throw (ex-info (str (tru "Password login is disabled for this instance."))
                        {:status-code 400})))))
  (let [key-hashed (or (:key_hashed session) (hash-session-key session-key))]
    (cond-> (-> session
                (dissoc :session_key)
                (assoc :key_hashed key-hashed))
      ;; on mysql if the id is not supplied insert-returning-instance(s)! returns nil
      ;; this is here to handle transitioning some tests
      (not (:id session)) (assoc :id (generate-session-id))
      (some-> (request/current-request) request/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token)))))

(t2/define-after-insert :model/Session
  [session]
  (when-let [user (t2/select-one :model/User (:user_id session))]
    (let [event {:user-id (u/the-id user)}]
      (events/publish-event! :event/user-login event)
      (when (nil? (:last_login user))
        (events/publish-event! :event/user-joined event))))
  session)
