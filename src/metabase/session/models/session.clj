(ns metabase.session.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [buddy.core.nonce :as nonce]
   [clojure.core.memoize :as memo]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.events :as events]
   [metabase.login-history.core :as login-history]
   [metabase.public-settings :as public-settings]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(mu/defn- random-anti-csrf-token :- [:re {:error/message "valid anti-CSRF token"} #"^[0-9a-f]{32}$"]
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(methodical/defmethod t2/table-name :model/Session [_model] :core_session)

(doto :model/Session
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-before-update :model/Session [_model]
  (throw (RuntimeException. "You cannot update a Session.")))

(t2/define-before-insert :model/Session
  [session]
  (when (or (uuid? (:id session)) (string/valid-uuid? (:id session)))
    (throw (RuntimeException. "Session id not be stored plaintext in the session table.")))
  (cond-> session
    (some-> (request/current-request) request/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token))))

(t2/define-after-insert :model/Session
  [{anti-csrf-token :anti_csrf_token, :as session}]
  (let [session-type (if anti-csrf-token :full-app-embed :normal)]
    (assoc session :type session-type)))

(def ^:private hash-session-id-cache
  (memo/lru (fn [session-id] (codecs/bytes->hex (buddy-hash/sha512 session-id))) {} :lru/threshold 100))

(defn hash-session-id
  "Hash the session-id for storage in the database"
  [session-id]
  (hash-session-id-cache (str session-id)))

(def ^:private CreateSessionUserInfo
  [:map
   [:id ms/PositiveInt]
   [:last_login :any]])

(def SessionSchema
  "Schema for a Session."
  [:and
   [:map-of :keyword :any]
   [:map
    [:id string?]
    [:type [:enum :normal :full-app-embed]]]])

(defmulti create-session!
  "Generate a new Session for a User. `session-type` is currently either `:password` (for email + password login) or
  `:sso` (for other login types). Returns the newly generated Session with the id as the plain-text session-id."
  {:arglists '([session-type user device-info])}
  (fn [session-type & _]
    session-type))

(mu/defmethod create-session! :sso :- SessionSchema
  [_ user :- CreateSessionUserInfo device-info :- request/DeviceInfo]
  (let [session-id (random-uuid)
        session-id-hashed (hash-session-id session-id)
        session (first (t2/insert-returning-instances! :model/Session
                                                       :id session-id-hashed
                                                       :user_id (u/the-id user)))]
    (assert (map? session))
    (let [event {:user-id (u/the-id user)}]
      (events/publish-event! :event/user-login event)
      (when (nil? (:last_login user))
        (events/publish-event! :event/user-joined event)))
    (login-history/record-login-history! session-id user device-info)
    (assoc session :id session-id)))

(mu/defmethod create-session! :password :- SessionSchema
  [session-type
   user :- CreateSessionUserInfo
   device-info :- request/DeviceInfo]
  ;; this is actually the same as `create-session!` for `:sso` but we check whether password login is enabled.
  (when-not (public-settings/enable-password-login)
    (throw (ex-info (str (tru "Password login is disabled for this instance.")) {:status-code 400})))
  ((get-method create-session! :sso) session-type user device-info))

(defn cleanup-sessions!
  "Deletes sessions from the database which are no longer valid"
  []
  (let [oldest-allowed [:inline (sql.qp/add-interval-honeysql-form (mdb/db-type)
                                                                   :%now
                                                                   (- (config/config-int :max-session-age))
                                                                   :minute)]]
    (t2/delete! :model/Session :created_at [:< oldest-allowed])))
