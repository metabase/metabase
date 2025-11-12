(ns metabase-enterprise.support-access-grants.models.support-access-grant-log
  "Model for support access grant log entries. Tracks temporary access grants for customer support."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SupportAccessGrantLog
  [_model]
  :support_access_grant_log)

(doto :model/SupportAccessGrantLog
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/batched-hydrate [:model/SupportAccessGrantLog :user_name]
  [_model _k grants]
  (let [user-ids   (keep :user_id grants)
        users      (when (seq user-ids)
                     (t2/select [:model/User :id :first_name] :id [:in user-ids]))
        user-names (into {} (map (fn [u] [(:id u) (str (:first_name u))]) users))]
    (for [grant grants]
      (assoc grant :user_name (get user-names (:user_id grant))))))
