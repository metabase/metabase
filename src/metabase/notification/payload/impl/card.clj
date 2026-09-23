(ns metabase.notification.payload.impl.card
  (:require
   [metabase.channel.render.core :as channel.render]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.notification.ai-summary :as ai-summary]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.notification.payload.impl.dashboard :as notification.dashboard]
   [metabase.notification.send :as notification.send]
   [metabase.request.core :as request]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.ui-logic :as ui-logic]))

(defn- goal-met? [{:keys [send_condition], :as notification_card} card_part]
  (let [goal-comparison      (if (= :goal_above (keyword send_condition)) >= <)
        goal-val             (ui-logic/find-goal-value card_part)
        comparison-col-rowfn (ui-logic/make-goal-comparison-rowfn (:card card_part)
                                                                  (get-in card_part [:result :data]))]
    (when-not (and goal-val comparison-col-rowfn)
      (throw (ex-info "Unable to compare results to goal for notificationt_card"
                      {:notification_card  notification_card
                       :result card_part})))
    (boolean
     (some (fn [row]
             (goal-comparison (comparison-col-rowfn row) goal-val))
           (get-in card_part [:result :data :rows])))))

(defn- condition-skip-reason
  "Why the alert's own `send_condition` says to stay quiet, or nil to send.

  This is the hard gate, evaluated before any AI work so that a tick which was going to be skipped
  anyway never costs an LLM call."
  [notification_card card_part]
  (let [send-condition (:send_condition notification_card)]
    (cond
      (-> notification_card :card :archived true?)
      :archived

      (= :has_result send-condition)
      (when (notification.execute/is-card-empty? card_part)
        :empty)

      (#{:goal_above :goal_below} send-condition)
      (when (not (goal-met? notification_card card_part))
        :goal-not-met)

      :else
      (let [^String error-text (format "Unrecognized alert with condition '%s'" send-condition)]
        (throw (IllegalArgumentException. error-text))))))

(mu/defmethod notification.payload/payload :notification/card
  [{:keys [creator_id payload subscriptions] :as _notification-info} :- ::notification.payload/Notification]
  (log/with-context {:card_id (:card_id payload)}
    (let [card-id     (:card_id payload)
          part        (notification.execute/execute-card creator_id card-id)
          card-result (:result part)
          card        (notification.db/card card-id)]
      (when (not= :completed (:status card-result))
        (throw (ex-info (format "Failed to execute card with error: %s" (:error card-result))
                        {:card_id card-id
                         :status (:status card-result)
                         :error  (:error card-result)})))
      ;; Both LLM calls run as the alert's creator, so Metabot permissions and AI usage limits are
      ;; charged to the same person whose permissions ran the query.
      (let [condition-skip (condition-skip-reason payload part)
            ;; same zone the email renders timestamps in, so the model and the recipient agree on
            ;; what day it is; week start so "end of the week" matches a GUI query's notion
            ai-context     {:card-name         (:name card)
                            :display           (:display card)
                            :timezone-id       (channel.render/defaulted-timezone card)
                            :first-day-of-week (some-> (lib-be/start-of-week) name)
                            :result            card-result}
            gate           (when-not condition-skip
                             (request/with-current-user creator_id
                               (ai-summary/should-send?
                                (assoc ai-context :send-prompt (:send_prompt payload)))))
            ;; nil from the gate means "no decision", which sends. Only an explicit false suppresses.
            ai-skip        (when (and gate (not (:send? gate))) :ai-declined)
            skip-reason    (or condition-skip ai-skip)]
        (when ai-skip
          (log/info "Metabot declined to send this alert" {:reason (:reason gate)}))
        {:card_part         part
         :card              card
         :skip_reason       skip-reason
         ;; only meaningful when the alert is actually delivered; a suppressed one is never rendered
         :ai_send_reason    (:explanation gate)
         ;; No point narrating an alert nobody will receive.
         :ai_summary        (when-not skip-reason
                              (request/with-current-user creator_id
                                (ai-summary/summarize
                                 (assoc ai-context :prompt (:prompt payload)))))
         :style             {:color_text_dark   channel.render/color-text-dark
                             :color_text_light  channel.render/color-text-light
                             :color_text_medium channel.render/color-text-medium}
         :notification_card payload
         :subscriptions     subscriptions}))))

(mu/defmethod notification.payload/skip-reason :notification/card
  [{:keys [payload]}]
  ;; Decided in `payload`, where the hard gate has to run first anyway to know whether the AI gate
  ;; and summary are worth paying for.
  (:skip_reason payload))

(mu/defmethod notification.send/do-after-notification-sent :notification/card
  [{:keys [id creator_id handlers] :as notification-info} :- ::models.notification/FullyHydratedNotification
   notification-payload
   skipped?]
  (when (and (-> notification-info :payload :send_once)
             (not skipped?))
    (log/info "Archiving due to send_once")
    (notification.db/deactivate-notification! (:id notification-info)))
  (try
    (when-let [rows (-> notification-payload :payload :card_part :result :data :rows)]
      (notification.payload/cleanup! rows))
    (catch Exception e
      (log/warn "Error cleaning up temp files for notification" id ":" (ex-message e))))
  (when-not skipped?
    (events/publish-event! :event/alert-send
                           {:id      id
                            :user-id creator_id
                            :object  {:recipients (notification.dashboard/handlers->audit-recipients handlers)
                                      :filters    (-> notification-info :alert :parameters)}})))
