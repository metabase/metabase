(ns metabase.api.setup
  (:require [compojure.core :refer [GET POST]]
            [metabase
             [driver :as driver]
             [email :as email]
             [events :as events]
             [public-settings :as public-settings]
             [setup :as setup]
             [util :as u]]
            [metabase.api
             [common :as api]
             [database :as database-api :refer [DBEngineString]]]
            [metabase.integrations.slack :as slack]
            [metabase.middleware.session :as mw.session]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [session :refer [Session]]
             [table :refer [Table]]
             [user :as user :refer [User]]]
            [metabase.util
             [i18n :refer [tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.util.UUID))

(def ^:private SetupToken
  "Schema for a string that matches the instance setup token."
  (su/with-api-error-message (s/constrained su/NonBlankString setup/token-match?)
    "Token does not match the setup token."))


(api/defendpoint POST "/"
  "Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID."
  [:as {{:keys                                         [token]
         {:keys [name engine details is_full_sync
                 is_on_demand schedules
                 auto_run_queries]
          :as   database}                              :database
         {:keys [first_name last_name email password]} :user
         {:keys [allow_tracking site_name]}            :prefs} :body, :as request}]
  {token            SetupToken
   site_name        su/NonBlankString
   first_name       su/NonBlankString
   last_name        su/NonBlankString
   email            su/Email
   password         su/ComplexPassword
   allow_tracking   (s/maybe (s/cond-pre s/Bool su/BooleanString))
   schedules        (s/maybe database-api/ExpandedSchedulesMap)
   auto_run_queries (s/maybe s/Bool)}
  ;; Now create the user
  (let [session-id (UUID/randomUUID)
        new-user   (db/insert! User
                     :email        email
                     :first_name   first_name
                     :last_name    last_name
                     :password     (str (UUID/randomUUID))
                     :is_superuser true)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (user/set-password! (:id new-user) password)
    ;; set a couple preferences
    (public-settings/site-name site_name)
    (public-settings/admin-email email)
    ;; default to `true` if allow_tracking isn't specified. The setting will set itself correctly whether a boolean or
    ;; boolean string is specified
    (public-settings/anon-tracking-enabled (or (nil? allow_tracking)
                                               allow_tracking))
    ;; setup database (if needed)
    (when engine
      (when-not (driver/available? engine)
        (throw (ex-info (tru "Cannot create Database: cannot find driver {0}." engine)
                 {:engine engine})))
      (let [db (db/insert! Database
                 (merge
                  {:name name, :engine engine, :details details}
                  (u/select-non-nil-keys database #{:is_on_demand :is_full_sync :auto_run_queries})
                  (when schedules
                    (database-api/schedule-map->cron-strings schedules))))]
        (events/publish-event! :database-create db)))
    ;; clear the setup token now, it's no longer needed
    (setup/clear-token!)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (db/insert! Session
      :id      (str session-id)
      :user_id (u/get-id new-user))
    ;; notify that we've got a new user in the system AND that this user logged in
    (events/publish-event! :user-create {:user_id (u/get-id new-user)})
    (events/publish-event! :user-login {:user_id (u/get-id new-user), :session_id (str session-id), :first_login true})
    ;; set `source-address-header` to "X-Forwarded-For" if such a header is present
    (when (get-in request [:headers "x-forwarded-for"])
      (public-settings/source-address-header "X-Forwarded-For"))
    (mw.session/set-session-cookie request {:id (str session-id)} session-id)))


(api/defendpoint POST "/validate"
  "Validate that we can connect to a database given a set of details."
  [:as {{{:keys [engine details]} :details, token :token} :body}]
  {token  SetupToken
   engine DBEngineString}
  (let [engine           (keyword engine)
        invalid-response (fn [field m] {:status 400, :body (if (#{:dbname :port :host} field)
                                                             {:errors {field m}}
                                                             {:message m})})]
    (database-api/test-database-connection engine details :invalid-response-handler invalid-response)))


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
   :description (tru "Does your team use Slack? If so, you can send automated updates via pulses and ask questions with MetaBot.")
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
   :link        "/admin/datamodel/database"
   :completed   (db/exists? Metric)
   :triggered   (>= (db/count Card) 30)})

(defmethod admin-checklist-entry :create-segments
  [_]
  {:title       (tru "Create segments")
   :group       (tru "Curate your data")
   :description (tru "Keep everyone on the same page by creating canonical sets of filters anyone can use while asking questions.")
   :link        "/admin/datamodel/database"
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
  (api/check-superuser)
  (admin-checklist))


(api/define-routes)
