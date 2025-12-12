(ns metabase.session.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [buddy.core.nonce :as nonce]
   [clojure.core.memoize :as memo]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.session.settings :as session.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- random-anti-csrf-token :- [:re {:error/message "valid anti-CSRF token"} #"^[0-9a-f]{32}$"]
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(def ^{:arglists '([session-key])} hash-session-key
  "Hash the session-key for storage in the database"
  (memo/lru (fn [^String session-key] (codecs/bytes->hex (buddy-hash/sha512 (.getBytes session-key java.nio.charset.StandardCharsets/US_ASCII)))) {} :lru/threshold 100))

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
