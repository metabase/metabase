(ns metabase-enterprise.audit-app.api.user
  "`/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature."
  (:require
   [compojure.core :refer [DELETE GET]]
   [metabase-enterprise.audit-app.audit :as ee-audit]
   [metabase.api.common :as api]
   [metabase.api.user :as api.user]
   [metabase.audit :as audit]
   [metabase.models.interface :as mi]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint GET "/audit-info"
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

(api/defendpoint DELETE "/:id/subscriptions"
  "Delete all Alert and DashboardSubscription subscriptions for a User (i.e., so they will no longer receive them).
  Archive all Alerts and DashboardSubscriptions created by the User. Only allowed for admins or for the current user."
  [id]
  {id ms/PositiveInt}
  (api.user/check-self-or-superuser id)
  ;; delete all `PulseChannelRecipient` rows for this User, which means they will no longer receive any
  ;; Alerts/DashboardSubscriptions
  (t2/delete! PulseChannelRecipient :user_id id)
  ;; archive anything they created.
  (t2/update! Pulse {:creator_id id, :archived false} {:archived true})
  api/generic-204-no-content)

(api/define-routes)
