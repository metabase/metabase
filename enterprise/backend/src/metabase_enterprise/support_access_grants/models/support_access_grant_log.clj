(ns metabase-enterprise.support-access-grants.models.support-access-grant-log
  "Model for support access grant log entries. Tracks temporary access grants for customer support."
  (:require
   [metabase-enterprise.support-access-grants.db :as support-access-grants.db]
   [metabase-enterprise.support-access-grants.settings :as sag.settings]
   [metabase.models.interface :as mi]
   [metabase.session.core :as session]
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
  (if-let [user (support-access-grants.db/user-by-email (sag.settings/support-access-grant-email))]
    (do
      (support-access-grants.db/update-user! (:id user) {:is_active true :is_superuser true})
      (assoc user :is_active true :is_superuser true))
    (support-access-grants.db/insert-user! {:email (sag.settings/support-access-grant-email)
                                            :first_name (sag.settings/support-access-grant-first-name)
                                            :last_name (sag.settings/support-access-grant-last-name)
                                            :is_superuser true})))

(methodical/defmethod t2/batched-hydrate [:model/SupportAccessGrantLog :user_info]
  [_model _k grants]
  (let [user-ids   (keep :user_id grants)
        user-info  (when (seq user-ids)
                     (support-access-grants.db/user-names-and-emails user-ids))]
    (for [grant grants]
      (let [user-info (get user-info (:user_id grant))]
        (assoc grant
               :user_name (:first_name user-info)
               :user_email (:email user-info))))))

(defn revoke-support-user-access!
  "Tear down the support user's access as of `ended-at`: drop superuser, expire every AuthIdentity so the
  time-limited password can't be used again, and end their sessions, recorded as ended by `ended-by` (the revoking
  user, or nil when the grant simply ran out). Called both when a grant is explicitly revoked and when one runs out."
  [support-user-id ended-at ended-by]
  (let [auth-identity-ids (support-access-grants.db/auth-identity-ids-of-user support-user-id)]
    (try
      (support-access-grants.db/update-user! support-user-id {:is_superuser false})
      (catch Exception e
        ;; If the support user is somehow the last admin, we can't remove superuser via model hooks.
        ;; Sessions and auth identities are still cleaned up below, preventing further access.
        (log/warnf "Could not remove superuser from support user %d: %s" support-user-id (ex-message e))))
    (when (seq auth-identity-ids)
      (support-access-grants.db/expire-auth-identities! auth-identity-ids ended-at))
    (session/end-sessions! {:user_id support-user-id} "support-grant-revoked" ended-by)))

(t2/define-after-update :model/SupportAccessGrantLog
  [{revoked-at :revoked_at, revoked-by :revoked_by_user_id, :as grant}]
  (u/prog1 grant
    (when revoked-at
      (when-let [support-user (support-access-grants.db/user-by-email (sag.settings/support-access-grant-email))]
        (revoke-support-user-access! (:id support-user) revoked-at revoked-by)))))
