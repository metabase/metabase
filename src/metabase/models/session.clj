(ns metabase.models.session
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.nonce :as nonce]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.models.login-history :as login-history]
   [metabase.public-settings :as public-settings]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.request.util :as req.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(mu/defn- random-anti-csrf-token :- [:re {:error/message "valid anti-CSRF token"} #"^[0-9a-f]{32}$"]
  []
  (codecs/bytes->hex (nonce/random-bytes 16)))

(def Session
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this till we replace all the symbols in our codebase."
  :model/Session)

(methodical/defmethod t2/table-name :model/Session [_model] :core_session)

(doto :model/Session
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/define-before-update :model/Session [_model]
  (throw (RuntimeException. "You cannot update a Session.")))

(t2/define-before-insert :model/Session
  [session]
  (cond-> session
    (some-> mw.misc/*request* req.util/embedded?) (assoc :anti_csrf_token (random-anti-csrf-token))))

(t2/define-after-insert :model/Session
  [{anti-csrf-token :anti_csrf_token, :as session}]
  (let [session-type (if anti-csrf-token :full-app-embed :normal)]
    (assoc session :type session-type)))

(defn maybe-send-login-from-new-device-email
  "If set to send emails on first login from new devices, that is the case, and its not the users first login, send an
  email from a separate thread."
  [history-record]
  (when (and (login-history/send-email-on-first-login-from-new-device)
             (login-history/first-login-on-this-device? history-record)
             (not (login-history/first-login-ever? history-record)))
    ;; if there's an existing open connection (and there seems to be one, but I'm not 100% sure why) we can't try to use
    ;; it across threads since it can close at any moment! So unbind it so the future can get its own thread.
    (binding [t2.conn/*current-connectable* nil]
      (future
        ;; off thread for both IP lookup and email sending. Either one could block and slow down user login (#16169)
        (try
          (let [[info] (login-history/human-friendly-infos [history-record])]
            (messages/send-login-from-new-device-email! info))
          (catch Throwable e
            (log/error e "Error sending 'login from new device' notification email")))))))

(def ^:private CreateSessionUserInfo
  [:map
   [:id ms/PositiveInt]
   [:last_login :any]])

(def SessionSchema
  "Schema for a Session."
  [:and
   [:map-of :keyword :any]
   [:map
    [:id uuid?]
    [:type [:enum :normal :full-app-embed]]]])

(defmulti create-session!
  "Generate a new Session for a User. `session-type` is currently either `:password` (for email + password login) or
  `:sso` (for other login types). Returns the newly generated Session."
  {:arglists '([session-type user device-info])}
  (fn [session-type & _]
    session-type))

(mu/defmethod create-session! :sso :- SessionSchema
  [_ user :- CreateSessionUserInfo device-info :- req.util/DeviceInfo]
  (let [session-id (random-uuid)
        session (first (t2/insert-returning-instances! :model/Session
                                                       :id (str session-id)
                                                       :user_id (u/the-id user)))]
    (assert (map? session))
    (let [event {:user-id (u/the-id user)}]
      (events/publish-event! :event/user-login event)
      (when (nil? (:last_login user))
        (events/publish-event! :event/user-joined event)))
    (let [history-entry (login-history/record-login-history! session-id (u/the-id user) device-info)]
      (when-not (:embedded device-info)
        (maybe-send-login-from-new-device-email history-entry))
      (when-not (:last_login user)
        (snowplow/track-event! ::snowplow/account {:event :new-user-created} (u/the-id user)))
      (assoc session :id session-id))))

(mu/defmethod create-session! :password :- SessionSchema
  [session-type
   user :- CreateSessionUserInfo
   device-info :- req.util/DeviceInfo]
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
