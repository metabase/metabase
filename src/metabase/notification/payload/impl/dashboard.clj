(ns metabase.notification.payload.impl.dashboard
  (:require
   [metabase.channel.render.core :as channel.render]
   [metabase.models.params.shared :as shared.params]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defenterprise the-parameters
  "OSS way of getting filter parameters for a dashboard subscription"
  metabase-enterprise.dashboard-subscription-filters.parameter
  [_dashboard-subscription-params dashboard-params]
  dashboard-params)

(defn- parameters
  "Returns the list of parameters applied to a dashboard subscription, filtering out ones
  without a value"
  [dashboard-subscription-params dashboard-params]
  (filter
   shared.params/param-val-or-default
   (the-parameters dashboard-subscription-params dashboard-params)))

(mu/defmethod notification.payload/payload :notification/dashboard
  [{:keys [creator_id dashboard_subscription] :as _notification-info} :- notification.payload/Notification]
  (let [dashboard-id (:dashboard_id dashboard_subscription)
        dashboard    (t2/hydrate (t2/select-one :model/Dashboard dashboard-id) :tabs)
        parameters   (parameters (:parameters dashboard_subscription) (:parameters dashboard))]
    {:dashboard_parts        (cond->> (notification.execute/execute-dashboard dashboard-id creator_id parameters)
                               (:skip_if_empty dashboard_subscription)
                               (remove (fn [{part-type :type :as part}]
                                         (and
                                          (= part-type :card)
                                          (zero? (get-in part [:result :row_count] 0))))))
     :dashboard              dashboard
     :style                  {:color_text_dark   channel.render/color-text-dark
                              :color_text_light  channel.render/color-text-light
                              :color_text_medium channel.render/color-text-medium}
     :parameters             parameters
     :dashboard_subscription dashboard_subscription}))

(mu/defmethod notification.payload/should-send-notification? :notification/dashboard
  [{:keys [payload] :as _noti-payload}]
  (let [{:keys [dashboard_parts dashboard_subscription]} payload]
    (if (:skip_if_empty dashboard_subscription)
      (not (every? notification.execute/is-card-empty? dashboard_parts))
      true)))
