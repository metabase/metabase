(ns metabase.api.setup
  (:require
   [compojure.core :refer [GET POST]]
   [java-time.api :as t]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.email :as email]
   [metabase.embed.settings :as embed.settings]
   [metabase.events :as events]
   [metabase.integrations.google :as google]
   [metabase.integrations.slack :as slack]
   [metabase.models.interface :as mi]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.session :refer [Session]]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.models.user :as user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.middleware.session :as mw.session]
   [metabase.setup :as setup]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:deprcated SetupToken
  "Schema for a string that matches the instance setup token."
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn
     {:error/message "setup token"}
     (every-pred string? #'setup/token-match?)]]
   (i18n/deferred-tru "Token does not match the setup token.")))

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
  (let [session-id (str (random-uuid))
        new-user   (first (t2/insert-returning-instances! User
                                                          :email        email
                                                          :first_name   first-name
                                                          :last_name    last-name
                                                          :password     (str (random-uuid))
                                                          :is_superuser true))
        user-id    (u/the-id new-user)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (user/set-password! user-id password)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (let [session (first (t2/insert-returning-instances! Session
                                                         :id      session-id
                                                         :user_id user-id))]
      ;; return user ID, session ID, and the Session object itself
      {:session-id session-id, :user-id user-id, :session session})))

(defn- setup-maybe-create-and-invite-user! [{:keys [email] :as user}, invitor]
  (when email
    (if-not (email/email-configured?)
      (log/error "Could not invite user because email is not configured.")
      (u/prog1 (user/create-and-invite-user! user invitor true)
        (user/set-permissions-groups! <> [(perms-group/all-users) (perms-group/admin)])
        (events/publish-event! :event/user-invited {:object (assoc <> :invite_method "email")})
        (snowplow/track-event! ::snowplow/invite-sent api/*current-user-id* {:invited-user-id (u/the-id <>)
                                                                             :source          "setup"})))))

(defn- setup-set-settings! [{:keys [email site-name site-locale]}]
  ;; set a couple preferences
  (public-settings/site-name! site-name)
  (public-settings/admin-email! email)
  (when site-locale
    (public-settings/site-locale! site-locale))
  ;; default to `true` the setting will set itself correctly whether a boolean or boolean string is specified
  (public-settings/anon-tracking-enabled! true))

(api/defendpoint POST "/"
  "Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID. This endpoint can also be used to add a database, create and invite a second admin, and/or
  set specific settings from the setup flow."
  [:as {{:keys                                          [token]
         {:keys [first_name last_name email password]}  :user
         {invited_first_name :first_name,
          invited_last_name  :last_name,
          invited_email      :email}                    :invite
         {:keys [site_name site_locale]} :prefs}
        :body,
        :as request}]
  {token              SetupToken
   first_name         [:maybe ms/NonBlankString]
   last_name          [:maybe ms/NonBlankString]
   email              ms/Email
   password           ms/ValidPassword
   invited_first_name [:maybe ms/NonBlankString]
   invited_last_name  [:maybe ms/NonBlankString]
   invited_email      [:maybe ms/Email]
   site_name          ms/NonBlankString
   site_locale        [:maybe ms/ValidLocale]}
  (letfn [(create! []
            (try
              (t2/with-transaction []
                (let [user-info (setup-create-user! {:email email
                                                     :first-name first_name
                                                     :last-name last_name
                                                     :password password})]
                  (setup-maybe-create-and-invite-user! {:email invited_email,
                                                        :first_name invited_first_name,
                                                        :last_name invited_last_name}
                                                       {:email email, :first_name first_name})
                  (setup-set-settings! {:email email :site-name site_name :site-locale site_locale})
                  user-info))
              (catch Throwable e
                ;; if the transaction fails, restore the Settings cache from the DB again so any changes made in this
                ;; endpoint (such as clearing the setup token) are reverted. We can't use `dosync` here to accomplish
                ;; this because there is `io!` in this block
                (setting.cache/restore-cache!)
                (throw e))))]
    (let [{:keys [user-id session-id session]} (create!)
          superuser (t2/select-one :model/User :id user-id)]
      (events/publish-event! :event/user-login {:user-id user-id})
      (when-not (:last_login superuser)
        (events/publish-event! :event/user-joined {:user-id user-id}))
      (snowplow/track-event! ::snowplow/new-user-created user-id)
      ;; return response with session ID and set the cookie as well
      (mw.session/set-session-cookies request {:id session-id} session (t/zoned-date-time (t/zone-id "GMT"))))))

;;; Admin Checklist

(def ^:private ChecklistState
  "Malli schema for the state to annotate the checklist."
  [:map {:closed true}
   [:db-type [:enum :h2 :mysql :postgres]]
   [:hosted? :boolean]
   [:embedding [:map
                [:interested? :boolean]
                [:done? :boolean]
                [:app-origin :boolean]]]
   [:configured [:map
                 [:email :boolean]
                 [:slack :boolean]
                 [:sso :boolean]]]
   [:counts [:map
             [:user :int]
             [:card :int]
             [:table :int]]]
   [:exists [:map
             [:model :boolean]
             [:non-sample-db :boolean]
             [:dashboard :boolean]
             [:pulse :boolean]
             [:hidden-table :boolean]
             [:collection :boolean]
             [:embedded-resource :boolean]]]])

(mu/defn ^:private state-for-checklist :- ChecklistState
  []
  {:db-type    (mdb/db-type)
   :hosted?    (premium-features/is-hosted?)
   :embedding  {:interested? (not (= (embed.settings/embedding-homepage) :hidden))
                :done?       (= (embed.settings/embedding-homepage) :dismissed-done)
                :app-origin  (boolean (embed.settings/embedding-app-origin))}
   :configured {:email (email/email-configured?)
                :slack (slack/slack-configured?)
                :sso   (google/google-auth-enabled)}
   :counts     {:user  (t2/count :model/User {:where (mi/exclude-internal-content-hsql :model/User)})
                :card  (t2/count :model/Card {:where (mi/exclude-internal-content-hsql :model/Card)})
                :table (val (ffirst (t2/query {:select [:%count.*]
                                               :from   [[(t2/table-name :model/Table) :t]]
                                               :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
                                               :where  (mi/exclude-internal-content-hsql :model/Database :table-alias :d)})))}
   :exists     {:non-sample-db (t2/exists? :model/Database {:where (mi/exclude-internal-content-hsql :model/Database)})
                :dashboard     (t2/exists? :model/Dashboard {:where (mi/exclude-internal-content-hsql :model/Dashboard)})
                :pulse         (t2/exists? :model/Pulse)
                :hidden-table  (t2/exists? :model/Table {:where [:and
                                                                 [:not= :visibility_type nil]
                                                                 (mi/exclude-internal-content-hsql :model/Table)]})
                :collection    (t2/exists? :model/Collection {:where (mi/exclude-internal-content-hsql :model/Collection)})
                :model         (t2/exists? :model/Card {:where [:and
                                                                [:= :type "model"]
                                                                (mi/exclude-internal-content-hsql :model/Card)]})
                :embedded-resource (or (t2/exists? :model/Card :enable_embedding true)
                          (t2/exists? :model/Dashboard :enable_embedding true))}})

(defn- get-connected-tasks
  [{:keys [configured counts exists embedding] :as _info}]
  [{:title       (tru "Add a database")
    :group       (tru "Get connected")
    :description (tru "Connect to your data so your whole team can start to explore.")
    :link        "/admin/databases/create"
    :completed   (exists :non-sample-db)
    :triggered   :always}
   {:title       (tru "Set up email")
    :group       (tru "Get connected")
    :description (tru "Add email credentials so you can more easily invite team members and get updates via Pulses.")
    :link        "/admin/settings/email"
    :completed   (configured :email)
    :triggered   :always}
   {:title       (tru "Set Slack credentials")
    :group       (tru "Get connected")
    :description (tru "Does your team use Slack? If so, you can send automated updates via dashboard subscriptions.")
    :link        "/admin/settings/slack"
    :completed   (configured :slack)
    :triggered   :always}
   {:title       (tru "Setup embedding")
    :group       (tru "Get connected")
    :description (tru "Get customizable, flexible, and scalable customer-facing analytics in no time")
    :link        "/admin/settings/embedding-in-other-applications"
    :completed   (or (embedding :done?)
                     (and (configured :sso) (embedding :app-origin))
                     (exists :embedded-resource))
    :triggered   (embedding :interested?)}
   {:title       (tru "Invite team members")
    :group       (tru "Get connected")
    :description (tru "Share answers and data with the rest of your team.")
    :link        "/admin/people/"
    :completed   (> (counts :user) 1)
    :triggered   (or (exists :dashboard)
                     (exists :pulse)
                     (>= (counts :card) 5))}])

(defn- productionize-tasks
  [info]
  [{:title       (tru "Switch to a production-ready app database")
    :group       (tru "Productionize")
    :description (tru "Migrate off of the default H2 application database to PostgreSQL or MySQL")
    :link        "https://www.metabase.com/docs/latest/installation-and-operation/migrating-from-h2"
    :completed   (not= (:db-type info) :h2)
    :triggered   (and (= (:db-type info) :h2) (not (:hosted? info)))}])

(defn- curate-tasks
  [{:keys [counts exists] :as _info}]
  [{:title       (tru "Hide irrelevant tables")
    :group       (tru "Curate your data")
    :description (tru "If your data contains technical or irrelevant info you can hide it.")
    :link        "/admin/datamodel/database"
    :completed   (exists :hidden-table)
    :triggered   (>= (counts :table) 20)}
   {:title       (tru "Organize questions")
    :group       (tru "Curate your data")
    :description (tru "Have a lot of saved questions in {0}? Create collections to help manage them and add context." (tru "Metabase"))
    :link        "/collection/root"
    :completed   (exists :collection)
    :triggered   (>= (counts :card) 30)}
   {:title       (tru "Create a model")
    :group       (tru "Curate your data")
    :description (tru "Set up friendly starting points for your team to explore data")
    :link        "/model/new"
    :completed   (exists :model)
    :triggered   (not (exists :model))}])

(mu/defn ^:private checklist-items
  [info :- ChecklistState]
  (remove nil?
          [{:name  (tru "Get connected")
            :tasks (get-connected-tasks info)}
           (when-not (:hosted? info)
             {:name  (tru "Productionize")
              :tasks (productionize-tasks info)})
           {:name  (tru "Curate your data")
            :tasks (curate-tasks info)}]))

(defn- annotate
  "Add `is_next_step` key to all the `steps` from `admin-checklist`, and ensure `triggered` is a boolean.
  The next step is the *first* step where `:triggered` is `true` and `:completed` is `false`."
  [checklist]
  (let [next-step        (->> checklist
                              (mapcat :tasks)
                              (filter (every-pred :triggered (complement :completed)))
                              first
                              :title)
        mark-next-step   (fn identity-task-by-name [task]
                           (assoc task :is_next_step (= (:title task) next-step)))
        update-triggered (fn [task]
                           (update task :triggered boolean))]
    (for [group checklist]
      (update group :tasks
              (partial map (comp update-triggered mark-next-step))))))

(defn- admin-checklist
  ([] (admin-checklist (state-for-checklist)))
  ([checklist-info]
   (annotate (checklist-items checklist-info))))

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
