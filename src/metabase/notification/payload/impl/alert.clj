(ns metabase.notification.payload.impl.alert
  (:require
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.pulse.render.style :as style]
   [metabase.util.malli :as mu]
   [metabase.util.ui-logic :as ui-logic]
   [toucan2.core :as t2]))

(mu/defmethod notification.payload/payload :notification/alert
  [{:keys [creator_id alert] :as _notification-info} :- notification.payload/Notification]
  (let [card_id (:card_id alert)]
    ;; TODO: maybe we shouldn't call this result beacuse there is a nested result
    {:result (notification.execute/execute-card creator_id card_id
                                                ;; for query_execution's context purposes
                                                ;; TODO: check whether we can remove this or name it?
                                                :pulse-id (:id alert))
     :card  (t2/select-one :model/Card card_id)
     :style {:color_text_dark   style/color-text-dark
             :color_text_light  style/color-text-light
             :color_text_medium style/color-text-medium}
     :alert alert}))

(defn- goal-met? [{:keys [alert_above_goal], :as alert} result]
  (let [goal-comparison      (if alert_above_goal >= <)
        goal-val             (ui-logic/find-goal-value result)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card result)
                                                                  (get-in result [:result :data]))]

    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info "Unable to compare results to goal for alert."
                      {:alert  alert
                       :result result})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in result [:result :data :rows])))))

(mu/defmethod notification.payload/should-send-notification? :notification/alert
  [{:keys [payload]}]
  (let [{:keys [alert result]} payload
        alert_condition        (:alert_condition alert)]
    (cond
      (= "rows" alert_condition)
      (not (notification.execute/is-card-empty? result))

      (= "goal" alert_condition)
      (goal-met? alert result)

      :else
      (let [^String error-text (format "Unrecognized alert with condition '%s'" alert_condition)]
        (throw (IllegalArgumentException. error-text))))))
