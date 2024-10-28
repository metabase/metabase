(ns metabase.notification.payload.impl.alert
  (:require
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.public-settings :as public-settings]
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.pulse.render.style :as style]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defmethod notification.payload/payload :notification/alert
  [{:keys [card_id creator_id alert] :as _notification-info} :- notification.payload/Notification]
  {:result (notification.execute/execute-card creator_id card_id
                                              ;; for query_execution's context purposes
                                              ;; TODO: check whether we can remove this or name it?
                                              :pulse-id (:id alert))
   :card  (t2/select-one :model/Card card_id)
   :style {:color_text_dark   style/color-text-dark
           :color_text_light  style/color-text-light
           :color_text_medium style/color-text-medium}
   :alert alert})
