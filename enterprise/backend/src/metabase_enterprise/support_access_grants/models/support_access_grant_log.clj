(ns metabase-enterprise.support-access-grants.models.support-access-grant-log
  "Model for support access grant log entries. Tracks temporary access grants for customer support."
  (:require
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
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
  "Fetch or Create the support user account from settings."
  []
  (or (t2/select-one :model/User :email (sag.settings/support-access-grant-email))
      (t2/insert-returning-instance! :model/User
                                     {:email (sag.settings/support-access-grant-email)
                                      :first_name (sag.settings/support-access-grant-first-name)
                                      :last_name (sag.settings/support-access-grant-last-name)
                                      :password (str (random-uuid))})))

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
      (let [support-user-id (:id (fetch-or-create-support-user!))
            auth-identity-ids (t2/select-pks-vec :model/AuthIdentity :user_id support-user-id)]
        (t2/update! :model/AuthIdentity :id [:in auth-identity-ids] {:expires_at revoked-at})
        (t2/delete! :model/Session :user_id support-user-id)))))
