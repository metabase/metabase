(ns metabase.notification.payload.impl.card
  (:require
   [metabase.channel.render.core :as channel.render]
   [metabase.events :as events]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.notification.send :as notification.send]
   [metabase.util.malli :as mu]
   [metabase.util.ui-logic :as ui-logic]
   [toucan2.core :as t2]))

(mu/defmethod notification.payload/payload :notification/card
  [{:keys [creator_id payload subscriptions] :as _notification-info} :- ::notification.payload/Notification]
  (let [card-id     (:card_id payload)
        part        (notification.execute/execute-card creator_id card-id)
        card-result (:result part)]
    (when (not= :completed (:status card-result))
      (throw (ex-info (format "Failed to execute card with error: %s" (:error card-result))
                      {:card_id card-id
                       :status (:status card-result)
                       :error  (:error card-result)})))
    {:card_part        part
     :card             (t2/select-one :model/Card card-id)
     :style            {:color_text_dark   channel.render/color-text-dark
                        :color_text_light  channel.render/color-text-light
                        :color_text_medium channel.render/color-text-medium}
     :notification_card payload
     :subscriptions     subscriptions}))

(defn- goal-met? [send_condition card result]
  (let [goal-comparison      (if (= :goal_above (keyword send_condition)) >= <)
        goal-val             (ui-logic/find-goal-value card)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn card (:data result))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info "Unable to compare results to goal for notificationt_card"
                      {:send_condition send_condition
                       :result result})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in result [:data :rows])))))

(mu/defmethod notification.payload/should-send-notification? :notification/card
  [{:keys [payload]}]
  (let [{:keys [notification_card card card_part]} payload
        send-condition (:send_condition notification_card)]
    (cond
      (-> card :archived true?)
      false

      (= :has_result send-condition)
      (not (notification.execute/is-card-empty? card_part))

      (#{:goal_above :goal_below} send-condition)
      (goal-met? send-condition card (:result card_part))

      :else
      (let [^String error-text (format "Unrecognized alert with condition '%s'" send-condition)]
        (throw (IllegalArgumentException. error-text))))))

(defmethod notification.send/do-after-notification-sent :notification/card
  [{:keys [id creator_id handlers] :as notification-info} _notification-payload]
  (when (-> notification-info :payload :send_once)
    (t2/update! :model/Notification (:id notification-info) {:active false}))
  (events/publish-event! :event/alert-send
                         {:id      id
                          :user-id creator_id
                          :object  {:recipients (->> handlers
                                                     (mapcat :recipients)
                                                     (map #(or (:user %) (:email %))))
                                    :filters    (-> notification-info :alert :parameters)}}))
