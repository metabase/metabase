(ns metabase.notification.payload.impl.card-row-diff
  (:require
   [cheshire.core :as json]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.execute]
   [metabase.notification.payload.temp-storage :as temp-storage]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- load-snapshot [notification-id]
  (when-let [row (t2/select-one :model/NotificationRowDiffSnapshot :notification_id notification-id)]
    (json/parse-string (:snapshot row) true)))

(defn- save-snapshot! [notification-id card-id rows]
  (let [snapshot-json (json/generate-string rows)
        now           (java.time.OffsetDateTime/now)]
    (if (t2/exists? :model/NotificationRowDiffSnapshot :notification_id notification-id)
      (t2/update! :model/NotificationRowDiffSnapshot
                  {:notification_id notification-id}
                  {:snapshot snapshot-json :captured_at now})
      (t2/insert! :model/NotificationRowDiffSnapshot
                  {:notification_id notification-id
                   :card_id         card-id
                   :snapshot        snapshot-json
                   :captured_at     now}))))

(defn- row-set [rows]
  (into #{} (map pr-str) rows))

(defn- diff-rows [current-rows previous-rows]
  (if (nil? previous-rows)
    []
    (let [prev-set (row-set previous-rows)]
      (remove (fn [row] (prev-set (pr-str row))) current-rows))))

(mu/defmethod notification.payload/payload :notification/card-row-diff
  [{:keys [id creator_id payload_id payload] :as _notification-info}
   :- ::notification.payload/Notification]
  ;; For unsaved "Send now" there is no DB record: read config from the inline :payload map.
  (let [unsaved?         (nil? id)
        config           (if payload_id
                           (t2/select-one :model/NotificationCardRowDiff payload_id)
                           payload)
        card-id          (:card_id config)
        send-mode        (keyword (get config :send_mode :per-row))
        message-template (:message_template config)]
    (log/with-context {:notification_id id :card_id card-id}
      (let [card-part   (notification.execute/execute-card creator_id card-id)
            card-result (:result card-part)]
        (when (not= :completed (:status card-result))
          (throw (ex-info (format "Card execution failed: %s" (:error card-result))
                          {:card_id card-id :status (:status card-result)})))
        (let [columns      (get-in card-result [:data :cols])
              raw-rows     (get-in card-result [:data :rows])
              ;; Large result sets are stored in a temp file — deref to get the plain vector.
              current-rows (if (temp-storage/streaming-temp-file? raw-rows) @raw-rows raw-rows)
              prev-rows    (when-not unsaved? (load-snapshot id))
              ;; Unsaved preview: cap to 3 rows so per-row sends don't flood Slack.
              new-rows     (if unsaved? (take 3 current-rows) (diff-rows current-rows prev-rows))]
          (when-not unsaved?
            (save-snapshot! id card-id current-rows))
          {:card             (t2/select-one :model/Card card-id)
           :card_part        card-part
           :columns          columns
           :new_rows         new-rows
           :send_mode        send-mode
           :message_template message-template
           ;; Never block an unsaved preview send for being a first run.
           :is_first_run     (and (not unsaved?) (nil? prev-rows))})))))

(mu/defmethod notification.payload/skip-reason :notification/card-row-diff
  [{:keys [payload]}]
  (cond
    (-> payload :card :archived true?) :archived
    (:is_first_run payload)            :first-run-snapshot-only
    (empty? (:new_rows payload))       :no-new-rows
    :else                              nil))
