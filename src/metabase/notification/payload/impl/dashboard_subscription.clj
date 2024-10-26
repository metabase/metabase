(ns metabase.notification.payload.impl.dashboard-subscription
  (:require
   [java-time.api :as t]
   [metabase.email.messages :as messages]
   [metabase.pulse.render.style :as render.style]
   [metabase.models.user :as user]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defmethod notification.payload/payload :notification/dashboard-subscription
  [{:keys [creator_id dashboard_subscription] :as _notification-info} :- notification.payload/Notification]
  (let [dashboard-id (:dashboard_id dashboard_subscription)]
    {:result                 (cond->> (notification.execute/execute-dashboard (:parameters dashboard_subscription) dashboard-id creator_id)
                               (:skip_if_empty dashboard_subscription)
                               (remove (fn [{part-type :type :as part}]
                                         (and
                                          (= part-type :card)
                                          (zero? (get-in part [:result :row_count] 0))))))
     :dashboard              (t2/hydrate (t2/select-one :model/Dashboard dashboard-id) :tabs)
     :style                  {:color_text_dark   render.style/color-text-dark
                              :color_text_light  render.style/color-text-light
                              :color_text_medium render.style/color-text-medium}
     :dashboard_subscription (t2/hydrate dashboard_subscription :creator)}))
