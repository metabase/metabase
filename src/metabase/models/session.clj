(ns metabase.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.events :as events]
   [metabase.public-settings :as public-settings]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as str]
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
  (cond-> session
    (some-> (request/current-request) request/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token))))

(t2/define-after-insert :model/Session
  [{anti-csrf-token :anti_csrf_token, :as session}]
  (let [session-type (if anti-csrf-token :full-app-embed :normal)]
    (assoc session :type session-type)))

(def ^:private CreateSessionUserInfo
  [:map
   [:id ms/PositiveInt]
   [:last_login :any]])


(def SessionSchema
  "Schema for a Session."
  [:and
   [:map-of :keyword :any]
   [:map
    [:id   string?]
    [:type [:enum :normal :full-app-embed]]]])

(defmulti create-session!
  "Generate a new Session for a User. `session-type` is currently either `:password` (for email + password login) or
  `:sso` (for other login types). Returns the newly generated Session."
  {:arglists '(^str [session-type user device-info])}
  (fn [session-type & _]
    session-type))

(mu/defn- record-login-history!
  [user-id     :- ms/PositiveInt
   device-info :- request/DeviceInfo]
  (t2/insert! :model/LoginHistory (merge {:user_id    user-id}
                                    device-info)))

(mu/defmethod create-session! :sso :- SessionSchema
  [_ user :- CreateSessionUserInfo device-info :- request/DeviceInfo]
  (let [session-id (str/random-string 32)
        session      (first (t2/insert-returning-instances! :model/Session
                              :id      session-id
                              :user_id (u/the-id user)))]
    (assert (map? session))
    (let [event {:user-id (u/the-id user)}]
      (events/publish-event! :event/user-login event)
      (when (nil? (:last_login user))
        (events/publish-event! :event/user-joined event)))
    (record-login-history! (u/the-id user) device-info)
    (when-not (:last_login user)
      (snowplow/track-event! ::snowplow/account {:event :new-user-created} (u/the-id user)))
    (assoc session :id session-id)))

(mu/defmethod create-session! :password :- SessionSchema
  [session-type
   user         :- CreateSessionUserInfo
   device-info  :- request/DeviceInfo]
  ;; this is actually the same as `create-session!` for `:sso` but we check whether password login is enabled.
  (when-not (public-settings/enable-password-login)
    (throw (ex-info (str (tru "Password login is disabled for this instance.")) {:status-code 400})))
  ((get-method create-session! :sso) session-type user device-info))
