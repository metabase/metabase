(ns metabase-enterprise.audit-app.api.user
  "`/api/ee/audit-app/user` endpoints. These only work if you have a premium token with the `:audit-app` feature."
  (:require [compojure.core :refer [DELETE]]
            [metabase.api.common :as api]
            [metabase.api.user :as api.user]
            [metabase.models.pulse-channel-recipient :refer [PulseChannelRecipient]]
            [toucan.db :as db]))

(api/defendpoint DELETE "/:id/subscriptions"
  "Delete all Alert and DashboardSubscription subscriptions for a User. Only allowed for admins or for the current
  user."
  [id]
  (api.user/check-self-or-superuser id)
  (db/delete! PulseChannelRecipient :user_id id)
  api/generic-204-no-content)

(api/define-routes)
