(ns metabase-enterprise.support-access-grants.core
  "Core business logic for support access grant management."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.support-access-grants.models.support-access-grant-log :as sag.model]
   [metabase-enterprise.support-access-grants.provider :as sag.provider]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.events.core :as events]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- active-grant-exists?
  "Check if there is an active (non-revoked, non-expired) grant."
  []
  (let [now (t/instant)]
    (t2/exists? :model/SupportAccessGrantLog
                :revoked_at nil
                :grant_end_timestamp [:> now])))

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
  (when (active-grant-exists?)
    (throw (ex-info (tru "Cannot create grant: an active grant already exists")
                    {:status-code 409})))
  (t2/with-transaction [_]
    (let [now (t/instant)
          grant-end (t/plus now (t/minutes grant-duration-minutes))
          grant-record {:user_id user-id
                        :ticket_number ticket-number
                        :notes notes
                        :grant_start_timestamp now
                        :grant_end_timestamp grant-end}
          grant (-> (t2/insert-returning-instance! :model/SupportAccessGrantLog grant-record)
                    (t2/hydrate :user_info))
          support-email (sag.settings/support-access-grant-email)
          support-user (sag.model/fetch-or-create-support-user!)
          token (sag.provider/create-support-access-reset! (:id support-user) grant)
          password-reset-url (when token
                               (str (system/site-url) "/auth/reset_password/" token))]

      ;; Publish event - the notification system handles email sending automatically
      (when (and token password-reset-url)
        (events/publish-event! :event/support-access-grant-created
                               {:support_email support-email
                                :ticket_number ticket-number
                                :duration_minutes grant-duration-minutes
                                :grant_end_time grant-end
                                :password_reset_url password-reset-url
                                :notes notes}))

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
  (let [grant (t2/select-one :model/SupportAccessGrantLog :id grant-id)]
    (when-not grant
      (throw (ex-info (tru "Grant not found")
                      {:status-code 404})))
    (when (:revoked_at grant)
      (throw (ex-info (tru "Grant is already revoked")
                      {:status-code 400})))
    (let [now (t/instant)]
      (t2/update! :model/SupportAccessGrantLog grant-id
                  {:revoked_at now
                   :revoked_by_user_id user-id})
      (-> (t2/select-one :model/SupportAccessGrantLog :id grant-id)
          (t2/hydrate :user_info)))))

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
        where-conditions (cond-> []
                           (not include-revoked)
                           (conj [:= :revoked_at nil])

                           ticket-number
                           (conj [:= :ticket_number ticket-number])

                           user-id
                           (conj [:= :user_id user-id]))
        where-clause (when (seq where-conditions)
                       (if (= 1 (count where-conditions))
                         (first where-conditions)
                         (into [:and] where-conditions)))
        grants (if where-clause
                 (t2/select :model/SupportAccessGrantLog
                            {:where where-clause
                             :limit limit
                             :offset offset
                             :order-by [[:created_at :desc]]})
                 (t2/select :model/SupportAccessGrantLog
                            {:limit limit
                             :offset offset
                             :order-by [[:created_at :desc]]}))
        grants-with-user-name (t2/hydrate grants :user_info)
        total (if where-clause
                (t2/count :model/SupportAccessGrantLog {:where where-clause})
                (t2/count :model/SupportAccessGrantLog))]
    {:data grants-with-user-name
     :total total
     :limit limit
     :offset offset}))

(defn get-current-grant
  "Get the currently active support access grant, if one exists.

  Returns the active grant record or nil if no active grant exists."
  []
  (some-> (t2/select-one :model/SupportAccessGrantLog
                         {:where [:and [:= :revoked_at nil]
                                  [:> :grant_end_timestamp :%now]]
                          :order-by [[:created_at :desc]
                                     [:id :desc]]})
          (t2/hydrate :user_info)))
