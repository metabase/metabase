(ns metabase.api.setup
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST]]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.api.common :as api]
            [metabase.api.common.validation :as validation]
            [metabase.api.database :as api.database :refer [DBEngineString]]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.email :as email]
            [metabase.events :as events]
            [metabase.integrations.slack :as slack]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.session :refer [Session]]
            [metabase.models.setting.cache :as setting.cache]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :as user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.server.middleware.session :as mw.session]
            [metabase.setup :as setup]
            [metabase.sync.schedules :as sync.schedules]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import java.util.UUID))

(def ^:private SetupToken
  "Schema for a string that matches the instance setup token."
  (su/with-api-error-message (s/constrained su/NonBlankString setup/token-match?)
    "Token does not match the setup token."))

(def ^:dynamic ^:private *allow-api-setup-after-first-user-is-created*
  "We must not allow users to setup multiple super users after the first user is created. But tests still need to be able
  to. This var is redef'd to false by certain tests to allow that."
  false)

(defn- setup-create-user! [{:keys [email first-name last-name password]}]
  (when (and (setup/has-user-setup)
             (not *allow-api-setup-after-first-user-is-created*))
    ;; many tests use /api/setup to setup multiple users, so *allow-api-setup-after-first-user-is-created* is
    ;; redefined by them
    (throw (ex-info
            (tru "The /api/setup route can only be used to create the first user, however a user currently exists.")
            {:status-code 403})))
  (let [session-id (str (UUID/randomUUID))
        new-user   (db/insert! User
                     :email        email
                     :first_name   first-name
                     :last_name    last-name
                     :password     (str (UUID/randomUUID))
                     :is_superuser true)
        user-id    (u/the-id new-user)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (user/set-password! user-id password)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (let [session (or (db/insert! Session
                        :id      session-id
                        :user_id user-id)
                      ;; HACK -- Toucan doesn't seem to work correctly with models with string IDs
                      (models/post-insert (Session (str session-id))))]
      ;; return user ID, session ID, and the Session object itself
      {:session-id session-id, :user-id user-id, :session session})))

(defn- setup-maybe-create-and-invite-user! [{:keys [email] :as user}, invitor]
  (when email
    (if-not (email/email-configured?)
      (log/error (trs "Could not invite user because email is not configured."))
      (u/prog1 (user/create-and-invite-user! user invitor true)
        (user/set-permissions-groups! <> [(perms-group/all-users) (perms-group/admin)])
        (snowplow/track-event! ::snowplow/invite-sent api/*current-user-id* {:invited-user-id (u/the-id <>)
                                                                             :source          "setup"})))))

(defn- setup-create-database!
  "Create a new Database. Returns newly created Database."
  [{:keys [name driver details schedules database creator-id]}]
  (when driver
    (when-not (some-> (u/ignore-exceptions (driver/the-driver driver)) driver/available?)
      (let [msg (tru "Cannot create Database: cannot find driver {0}." driver)]
        (throw (ex-info msg {:errors {:database {:engine msg}}, :status-code 400}))))
    (db/insert! Database
      (merge
       {:name name, :engine driver, :details details, :creator_id creator-id}
       (u/select-non-nil-keys database #{:is_on_demand :is_full_sync :auto_run_queries})
       (when schedules
         (sync.schedules/schedule-map->cron-strings schedules))))))

(defn- setup-set-settings! [_request {:keys [email site-name site-locale allow-tracking?]}]
  ;; set a couple preferences
  (public-settings/site-name! site-name)
  (public-settings/admin-email! email)
  (when site-locale
    (public-settings/site-locale! site-locale))
  ;; default to `true` if allow_tracking isn't specified. The setting will set itself correctly whether a boolean or
  ;; boolean string is specified
  (public-settings/anon-tracking-enabled! (or (nil? allow-tracking?)
                                              allow-tracking?)))

(api/defendpoint POST "/"
  "Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID. This endpoint also can also be used to add a database, create and invite a second admin, and/or
  set specific settings from the setup flow."
  [:as {{:keys                                          [token]
         {:keys [name engine details
                 schedules auto_run_queries]
          :as   database}                               :database
         {:keys [first_name last_name email password]}  :user
         {invited_first_name :first_name,
          invited_last_name  :last_name,
          invited_email      :email}                    :invite
         {:keys [allow_tracking site_name site_locale]} :prefs} :body, :as request}]
  {token              SetupToken
   site_name          su/NonBlankString
   site_locale        (s/maybe su/ValidLocale)
   first_name         su/NonBlankString
   last_name          su/NonBlankString
   email              su/Email
   invited_first_name (s/maybe su/NonBlankString)
   invited_last_name  (s/maybe su/NonBlankString)
   invited_email      (s/maybe su/Email)
   password           su/ValidPassword
   allow_tracking     (s/maybe (s/cond-pre s/Bool su/BooleanString))
   schedules          (s/maybe sync.schedules/ExpandedSchedulesMap)
   auto_run_queries   (s/maybe s/Bool)}
  (letfn [(create! []
            (try
              (db/transaction
               (let [user-info (setup-create-user!
                                {:email email, :first-name first_name, :last-name last_name, :password password})
                     db        (setup-create-database! {:name name
                                                        :driver engine
                                                        :details details
                                                        :schedules schedules
                                                        :database database
                                                        :creator-id (:user-id user-info)})]
                 (setup-maybe-create-and-invite-user! {:email invited_email,
                                                       :first_name invited_first_name,
                                                       :last_name invited_last_name}
                                                      {:email email, :first_name first_name})
                 (setup-set-settings!
                  request
                  {:email email, :site-name site_name, :site-locale site_locale, :allow-tracking? allow_tracking})
                 (assoc user-info :database db)))
              (catch Throwable e
                ;; if the transaction fails, restore the Settings cache from the DB again so any changes made in this
                ;; endpoint (such as clearing the setup token) are reverted. We can't use `dosync` here to accomplish
                ;; this because there is `io!` in this block
                (setting.cache/restore-cache!)
                (snowplow/track-event! ::snowplow/database-connection-failed nil {:database engine, :source :setup})
                (throw e))))]
    (let [{:keys [user-id session-id database session]} (create!)]
      (events/publish-event! :database-create database)
      (events/publish-event! :user-login {:user_id user-id, :session_id session-id, :first_login true})
      (snowplow/track-event! ::snowplow/new-user-created user-id)
      (when database (snowplow/track-event! ::snowplow/database-connection-successful
                                            user-id
                                            {:database engine, :database-id (u/the-id database), :source :setup}))
      ;; return response with session ID and set the cookie as well
      (mw.session/set-session-cookie request {:id session-id} session))))

(api/defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  [:as {{{:keys [engine details]} :details, token :token} :body}]
  {token  SetupToken
   engine DBEngineString}
  (let [engine           (keyword engine)
        invalid-response (fn [field m] {:status 400, :body (if (#{:dbname :host :host-and-port :password
                                                                  :ssh-username-and-password :ssl
                                                                  :username :username-and-password} field)
                                                             {:errors {field m}}
                                                             {:message m})})
        error-or-nil     (api.database/test-database-connection engine details :invalid-response-handler invalid-response)]
    (when error-or-nil
      (snowplow/track-event! ::snowplow/database-connection-failed
                             nil
                             {:database engine, :source :setup})
      error-or-nil)))


;;; Admin Checklist

(defmulti ^:private admin-checklist-entry
  {:arglists '([entry-name])}
  identity)

(defmethod admin-checklist-entry :add-a-database
  [_]
  {:title       (tru "Add a database")
   :group       (tru "Get connected")
   :description (tru "Connect to your data so your whole team can start to explore.")
   :link        "/admin/databases/create"
   :completed   (db/exists? Database, :is_sample false)
   :triggered   :always})

(defmethod admin-checklist-entry :set-up-email
  [_]
  {:title       (tru "Set up email")
   :group       (tru "Get connected")
   :description (tru "Add email credentials so you can more easily invite team members and get updates via Pulses.")
   :link        "/admin/settings/email"
   :completed   (email/email-configured?)
   :triggered   :always})

(defmethod admin-checklist-entry :set-slack-credentials
  [_]
  {:title       (tru "Set Slack credentials")
   :group       (tru "Get connected")
   :description (tru "Does your team use Slack? If so, you can send automated updates via dashboard subscriptions.")
   :link        "/admin/settings/slack"
   :completed   (slack/slack-configured?)
   :triggered   :always})

(defmethod admin-checklist-entry :invite-team-members
  [_]
  {:title       (tru "Invite team members")
   :group       (tru "Get connected")
   :description (tru "Share answers and data with the rest of your team.")
   :link        "/admin/people/"
   :completed   (> (db/count User) 1)
   :triggered   (or (db/exists? Dashboard)
                    (db/exists? Pulse)
                    (>= (db/count Card) 5))})

(defmethod admin-checklist-entry :hide-irrelevant-tables
  [_]
  {:title       (tru "Hide irrelevant tables")
   :group       (tru "Curate your data")
   :description (tru "If your data contains technical or irrelevant info you can hide it.")
   :link        "/admin/datamodel/database"
   :completed   (db/exists? Table, :visibility_type [:not= nil])
   :triggered   (>= (db/count Table) 20)})

(defmethod admin-checklist-entry :organize-questions
  [_]
  {:title       (tru "Organize questions")
   :group       (tru "Curate your data")
   :description (tru "Have a lot of saved questions in {0}? Create collections to help manage them and add context." (tru "Metabase"))
   :link        "/collection/root"
   :completed   (db/exists? Collection)
   :triggered   (>= (db/count Card) 30)})


(defmethod admin-checklist-entry :create-metrics
  [_]
  {:title       (tru "Create metrics")
   :group       (tru "Curate your data")
   :description (tru "Define canonical metrics to make it easier for the rest of your team to get the right answers.")
   :link        "/admin/datamodel/metrics"
   :completed   (db/exists? Metric)
   :triggered   (>= (db/count Card) 30)})

(defmethod admin-checklist-entry :create-segments
  [_]
  {:title       (tru "Create segments")
   :group       (tru "Curate your data")
   :description (tru "Keep everyone on the same page by creating canonical sets of filters anyone can use while asking questions.")
   :link        "/admin/datamodel/segments"
   :completed   (db/exists? Segment)
   :triggered   (>= (db/count Card) 30)})

(defn- admin-checklist-values []
  (map
   admin-checklist-entry
   [:add-a-database :set-up-email :set-slack-credentials :invite-team-members :hide-irrelevant-tables
    :organize-questions :create-metrics :create-segments]))

(defn- add-next-step-info
  "Add `is_next_step` key to all the `steps` from `admin-checklist`.
  The next step is the *first* step where `:triggered` is `true` and `:completed` is `false`."
  [steps]
  (first
   (reduce
    (fn [[acc already-found-next-step?] {:keys [triggered completed], :as step}]
      (let [is-next-step? (and (not already-found-next-step?)
                               triggered
                               (not completed))
            step          (-> (assoc step :is_next_step (boolean is-next-step?))
                              (update :triggered boolean))]
        [(conj (vec acc) step)
         (or is-next-step? already-found-next-step?)]))
    [[] false]
    steps)))

(defn- partition-steps-into-groups
  "Partition the admin checklist steps into a sequence of groups."
  [steps]
  (for [[{group-name :group}, :as tasks] (partition-by :group steps)]
    {:name  group-name
     :tasks tasks}))

(defn- admin-checklist []
  (partition-steps-into-groups (add-next-step-info (admin-checklist-values))))

(api/defendpoint GET "/admin_checklist"
  "Return various \"admin checklist\" steps and whether they've been completed. You must be a superuser to see this!"
  []
  (validation/check-has-application-permission :setting)
  (admin-checklist))

;; User defaults endpoint

(api/defendpoint GET "/user_defaults"
  "Returns object containing default user details for initial setup, if configured,
   and if the provided token value matches the token in the configuration value."
  [token]
  (let [{config-token :token :as defaults} (config/mb-user-defaults)]
    (api/check-404 config-token)
    (api/check-403 (= token config-token))
    (dissoc defaults :token)))

(api/define-routes)
