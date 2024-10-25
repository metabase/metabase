(ns metabase.notification.payload.impl.alert
  (:require
   [java-time.api :as t]
   [metabase.email.messages :as messages]
   [metabase.models.user :as user]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.malli :as mu]))

(mu/defmethod notification.payload/payload :notification/alert
  [{:keys [card_id creator_id] :as _notification-info} :- notification.payload/Notification]
  #_{:result 1})
