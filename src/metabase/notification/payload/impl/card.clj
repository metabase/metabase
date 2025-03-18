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
  [{:keys [creator_id alert] :as _notification-info} :- notification.payload/Notification]
  (let [card-id     (:card_id alert)
        part        (notification.execute/execute-card creator_id card-id)
        card-result (:result part)]
    (when (not= :completed (:status card-result))
      (throw (ex-info (format "Failed to execute card with error: %s" (:error card-result))
                      {:card_id card-id
                       :status (:status card-result)
                       :error  (:error card-result)})))

    {:card_part   part
     :card        (t2/select-one :model/Card card-id)
     :style       {:color_text_dark   channel.render/color-text-dark
                   :color_text_light  channel.render/color-text-light
                   :color_text_medium channel.render/color-text-medium}
     :alert       alert}))

(defn- goal-met? [{:keys [alert_above_goal], :as alert} card_part]
  (let [goal-comparison      (if alert_above_goal >= <)
        goal-val             (ui-logic/find-goal-value card_part)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card card_part)
                                                                  (get-in card_part [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info "Unable to compare results to goal for alert."
                      {:alert  alert
                       :result card_part})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in card_part [:result :data :rows])))))

(mu/defmethod notification.payload/should-send-notification? :notification/card
  [{:keys [payload]}]
  (let [{:keys [alert card_part]} payload
        alert_condition        (:alert_condition alert)]
    (cond
      (= "rows" alert_condition)
      (not (notification.execute/is-card-empty? card_part))

      (= "goal" alert_condition)
      (goal-met? alert card_part)

      :else
      (let [^String error-text (format "Unrecognized alert with condition '%s'" alert_condition)]
        (throw (IllegalArgumentException. error-text))))))

(defmethod notification.send/do-after-notification-sent :notification/card
  [{:keys [id creator_id alert handlers] :as notification-info} _notification-payload]
  (when (:alert_first_only alert)
    (t2/delete! :model/Pulse (:id alert)))
  (events/publish-event! :event/alert-send
                         {:id      id
                          :user-id creator_id
                          :object  {:recipients (->> handlers
                                                     (mapcat :recipients)
                                                     (map #(or (:user %) (:email %))))
                                    :filters    (-> notification-info :alert :parameters)}}))
