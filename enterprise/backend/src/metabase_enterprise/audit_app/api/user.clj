(ns metabase-enterprise.audit-app.api.user
  "`/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature."
  (:require [compojure.core :refer [DELETE]]
            [metabase.api.common :as api]
            [metabase.api.user :as api.user]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [toucan.db :as db]))

(api/defendpoint DELETE "/:id/subscriptions"
  "Delete all Alert and DashboardSubscription subscriptions for a User (i.e., so they will no longer receive them).
  Archive all Alerts and DashboardSubscriptions created by the User. Only allowed for admins or for the current user."
  [id]
  (api.user/check-self-or-superuser id)
  ;; delete all `PulseChannelRecipient` rows for this User, which means they will no longer receive any
  ;; Alerts/DashboardSubscriptions
  (db/delete! PulseChannelRecipient :user_id id)
  ;; archive anything they created.
  (db/update-where! Pulse {:creator_id id, :archived false} :archived true)
  api/generic-204-no-content)

(api/define-routes)
