(ns metabase.notification.payload.impl.dashboard-subscription
  (:require
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.pulse.parameters :as pulse-params]
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.pulse.render.style :as style]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defmethod notification.payload/payload :notification/dashboard-subscription
  [{:keys [creator_id dashboard_subscription] :as _notification-info} :- notification.payload/Notification]
  (let [dashboard-id (:dashboard_id dashboard_subscription)
        dashboard    (t2/hydrate (t2/select-one :model/Dashboard dashboard-id) :tabs)
        parameters   (pulse-params/parameters (:parameters dashboard_subscription) (:parameters dashboard))]
    {:dashboard_parts        (cond->> (notification.execute/execute-dashboard dashboard-id creator_id parameters)
                               (:skip_if_empty dashboard_subscription)
                               (remove (fn [{part-type :type :as part}]
                                         (and
                                          (= part-type :card)
                                          (zero? (get-in part [:result :row_count] 0))))))
     :dashboard              dashboard
     :style                  {:color_text_dark   style/color-text-dark
                              :color_text_light  style/color-text-light
                              :color_text_medium style/color-text-medium}
     :parameters             parameters
     :dashboard_subscription dashboard_subscription}))

(mu/defmethod notification.payload/should-send-notification? :notification/dashboard-subscription
  [{:keys [payload] :as _noti-payload}]
  (let [{:keys [dashboard_parts dashboard_subscription]} payload]
    (if (:skip_if_empty dashboard_subscription)
      (not (every? notification.execute/is-card-empty? dashboard_parts))
      true)))
