(ns metabase-enterprise.support-access-grants.core
  "Core business logic for support access grant management."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.db :as support-access-grants.db]
   [metabase-enterprise.support-access-grants.models.support-access-grant-log :as sag.model]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.events.core :as events]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(def ^:private grant-lifecycle-lock
  ::grant-lifecycle)

(defn- active-grant-exists?
  "Check if there is an active (non-revoked, non-expired) grant."
  []
  (let [now (t/instant)]
    (support-access-grants.db/active-grant-exists? now)))

(defn create-grant!
  "Create a new support access grant.

  Parameters:
  - user-id: ID of the user creating the grant
  - grant-duration-minutes: Duration in minutes (max 10080 = 7 days)
  - ticket-number: The support ticket number (string)
  - notes: Additional information (string)

  Returns the created grant record with an optional :token field if a support user was found or created.

  Throws if an active grant already exists."
  [user-id grant-duration-minutes ticket-number notes]
  (cluster-lock/with-cluster-lock grant-lifecycle-lock
    (when (active-grant-exists?)
      (throw (ex-info (tru "Cannot create grant: an active grant already exists")
                      {:status-code 409})))
    (let [now                (t/instant)
          grant-end          (t/plus now (t/minutes grant-duration-minutes))
          grant-record       {:user_id               user-id
                              :ticket_number         ticket-number
                              :notes                 notes
                              :grant_start_timestamp now
                              :grant_end_timestamp   grant-end}
          grant              (-> (support-access-grants.db/insert-grant! grant-record)
                                 support-access-grants.db/hydrate-user-info)
          support-email      (sag.settings/support-access-grant-email)
          support-user       (sag.model/fetch-or-create-support-user!)
          token              (sag.provider/create-support-access-reset! (:id support-user) grant)
          password-reset-url (when token
                               (str (system/site-url) "/auth/reset_password/" token))]
      ;; Publish event - the notification system handles email sending automatically
      (when (and token password-reset-url)
        (events/publish-event! :event/support-access-grant-created
                               {:support_email      support-email
                                :ticket_number      ticket-number
                                :duration_minutes   grant-duration-minutes
                                :grant_end_time     grant-end
                                :password_reset_url password-reset-url
                                :notes              notes}))
      ;; Return grant with token
      (cond-> grant
        token (assoc :token token)))))

(defn revoke-grant!
  "Revoke an existing support access grant.

  Parameters:
  - user-id: ID of the user revoking the grant
  - grant-id: The ID of the grant to revoke

  Returns the updated grant record.

  Throws if:
  - Grant doesn't exist
  - Grant is already revoked"
  [user-id grant-id]
  (let [grant (support-access-grants.db/grant grant-id)]
    (when-not grant
      (throw (ex-info (tru "Grant not found")
                      {:status-code 404})))
    (when (:revoked_at grant)
      (throw (ex-info (tru "Grant is already revoked")
                      {:status-code 400})))
    (let [now (t/instant)]
      (support-access-grants.db/update-grant! grant-id
                                              {:revoked_at now
                                               :revoked_by_user_id user-id})
      (-> (support-access-grants.db/grant grant-id)
          support-access-grants.db/hydrate-user-info))))

(defn expire-ended-grants!
  "Tear down the support user's access once every grant has ended.

  A no-op when there is no support user, when a grant is still running, or when access is already torn down."
  []
  (when-let [{support-user-id :id, superuser? :is_superuser}
             (support-access-grants.db/user-superuser-flag-by-email (sag.settings/support-access-grant-email))]
    (when (or superuser? (support-access-grants.db/session-exists-for-user? support-user-id))
      (cluster-lock/with-cluster-lock grant-lifecycle-lock
        ;; Re-check after acquiring the same lock used by grant creation. This makes credential teardown and grant
        ;; creation mutually exclusive across the cluster, so teardown cannot invalidate a newly created grant.
        (when-not (active-grant-exists?)
          (log/infof "Support access grant has ended; revoking access for support user %d" support-user-id)
          (sag.model/revoke-support-user-access! support-user-id (t/instant)))))))

(defn list-grants
  "List support access grants with optional filtering and pagination.

  Parameters:
  - opts: Map with optional keys:
    - :limit (default 50, max 100)
    - :offset (default 0)
    - :ticket-number (optional filter)
    - :user-id (optional filter)
    - :include-revoked (default false)

  Returns a map with:
  - :data - Vector of grant records
  - :total - Total count of matching grants
  - :limit - Applied limit
  - :offset - Applied offset"
  [{:keys [limit offset ticket-number user-id include-revoked]
    :or {limit 50 offset 0 include-revoked false}}]

  (let [limit (min (or limit 50) 100)
        offset (or offset 0)
        grants (support-access-grants.db/grants-page include-revoked ticket-number user-id limit offset)
        grants-with-user-name (support-access-grants.db/hydrate-user-info grants)
        total (support-access-grants.db/grant-count include-revoked ticket-number user-id)]
    {:data grants-with-user-name
     :total total
     :limit limit
     :offset offset}))

(defn get-current-grant
  "Get the currently active support access grant, if one exists.

  Returns the active grant record or nil if no active grant exists."
  []
  (some-> (support-access-grants.db/current-grant)
          support-access-grants.db/hydrate-user-info))
