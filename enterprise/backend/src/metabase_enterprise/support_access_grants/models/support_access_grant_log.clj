(ns metabase-enterprise.support-access-grants.models.support-access-grant-log
  "Model for support access grant log entries. Tracks temporary access grants for customer support."
  (:require
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SupportAccessGrantLog
  [_model]
  :support_access_grant_log)

(doto :model/SupportAccessGrantLog
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser)
  (derive :hook/timestamped?))

(defn fetch-or-create-support-user!
  "Fetch or Create the support user account from settings.
  If the user exists but is deactivated, reactivate them.
  Always ensures the support user has superuser access."
  []
  (if-let [user (t2/select-one :model/User :email (sag.settings/support-access-grant-email))]
    (do
      (t2/update! :model/User (:id user) {:is_active true :is_superuser true})
      (assoc user :is_active true :is_superuser true))
    (t2/insert-returning-instance! :model/User
                                   {:email (sag.settings/support-access-grant-email)
                                    :first_name (sag.settings/support-access-grant-first-name)
                                    :last_name (sag.settings/support-access-grant-last-name)
                                    :password (str (random-uuid))
                                    :is_superuser true})))

(methodical/defmethod t2/batched-hydrate [:model/SupportAccessGrantLog :user_info]
  [_model _k grants]
  (let [user-ids   (keep :user_id grants)
        user-info  (when (seq user-ids)
                     (t2/select-pk->fn #(select-keys % [:first_name :email])
                                       [:model/User :id :first_name :email]
                                       :id [:in user-ids]))]
    (for [grant grants]
      (let [user-info (get user-info (:user_id grant))]
        (assoc grant
               :user_name (:first_name user-info)
               :user_email (:email user-info))))))

(t2/define-after-update :model/SupportAccessGrantLog
  [{revoked-at :revoked_at :as grant}]
  (u/prog1 grant
    (when revoked-at
      (when-let [support-user (t2/select-one :model/User :email (sag.settings/support-access-grant-email))]
        (let [support-user-id (:id support-user)
              auth-identity-ids (t2/select-pks-vec :model/AuthIdentity :user_id support-user-id)]
          (try
            (t2/update! :model/User support-user-id {:is_superuser false})
            (catch Exception e
              ;; If the support user is somehow the last admin, we can't remove superuser via model hooks.
              ;; Sessions and auth identities are still cleaned up below, preventing further access.
              (log/warnf e "Could not remove superuser from support user %d" support-user-id)))
          (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at revoked-at})
          (t2/delete! :model/Session :user_id support-user-id))))))
