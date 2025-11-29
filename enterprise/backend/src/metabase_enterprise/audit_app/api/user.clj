(ns metabase-enterprise.audit-app.api.user
  "`/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature."
  (:require
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.audit-app.core :as audit]
   [metabase.models.interface :as mi]
   [metabase.users-rest.api :as api.user]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/audit-info"
  "Gets audit info for the current user if he has permissions to access the audit collection.
  Otherwise return an empty map."
  []
  (let [custom-reports     (audit/default-custom-reports-collection)
        question-overview  (audit/memoized-select-audit-entity :model/Dashboard ee-audit/default-question-overview-entity-id)
        dashboard-overview (audit/memoized-select-audit-entity :model/Dashboard ee-audit/default-dashboard-overview-entity-id)]
    (merge
     {}
     (when (mi/can-read? (audit/default-custom-reports-collection))
       {(:slug custom-reports) (:id custom-reports)})
     (when (mi/can-read? (audit/default-audit-collection))
       {(u/slugify (:name question-overview)) (:id question-overview)
        (u/slugify (:name dashboard-overview)) (:id dashboard-overview)}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id/subscriptions"
  "Delete all Alert and DashboardSubscription subscriptions for a User (i.e., so they will no longer receive them).
  Archive all Alerts and DashboardSubscriptions created by the User. Only allowed for admins or for the current user."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api.user/check-self-or-superuser id)
  ;; delete all `PulseChannelRecipient` rows for this User, which means they will no longer receive any
  ;; Alerts/DashboardSubscriptions
  (t2/delete! :model/PulseChannelRecipient :user_id id)
  (t2/delete! :model/NotificationRecipient :user_id id)
  ;; archive anything they created.
  (t2/update! :model/Pulse {:creator_id id, :archived false} {:archived true})
  (t2/update! :model/Notification {:creator_id id :active true} {:active false})
  api/generic-204-no-content)
