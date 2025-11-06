(ns metabase-enterprise.support-access-grants.core
  "Core business logic for support access grant management."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
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
  - ticket-number: The support ticket number (string)
  - grant-duration-minutes: Duration in minutes (max 10080 = 7 days)

  Returns the created grant record.

  Throws if an active grant already exists."
  [user-id ticket-number grant-duration-minutes]
  (when (active-grant-exists?)
    (throw (ex-info (tru "Cannot create grant: an active grant already exists")
                    {:status-code 409})))
  (let [now (t/instant)
        grant-end (t/plus now (t/minutes grant-duration-minutes))
        grant-record {:user_id user-id
                      :ticket_number ticket-number
                      :grant_start_timestamp now
                      :grant_end_timestamp grant-end}]
    (t2/insert-returning-instance! :model/SupportAccessGrantLog grant-record)))

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
      (t2/select-one :model/SupportAccessGrantLog :id grant-id))))

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
        total (if where-clause
                (t2/count :model/SupportAccessGrantLog {:where where-clause})
                (t2/count :model/SupportAccessGrantLog))]
    {:data grants
     :total total
     :limit limit
     :offset offset}))

(defn get-current-grant
  "Get the currently active support access grant, if one exists.

  Returns the active grant record or nil if no active grant exists."
  []
  (t2/select-one :model/SupportAccessGrantLog
                 {:where [:and [:= :revoked_at nil]
                          [:> :grant_end_timestamp :%now]]
                  :order-by [[:created_at :desc]
                             [:id :desc]]}))
