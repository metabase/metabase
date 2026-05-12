(ns metabase-enterprise.introspector.workload.history
  "Enrich workload slot rows with the most recent successful TaskRun duration.
   Only the job types that already wrap in TaskRun (sync, alert,
   dashboard-subscription) get a real value; transform-job and persisted-refresh
   return nil because they aren't wrapped yet."
  (:require
   [java-time.api :as t]
   [toucan2.core :as t2])
  (:import (java.time Instant)))

(set! *warn-on-reflection* true)

;; Our slot row entity-id != TaskRun.entity_id for two of the three supported
;; types — the schedule fires on a subscription/pulse, but TaskRun is keyed on
;; the underlying card/dashboard. Translate in batch so we never N+1.
;;
;; Alert chain (3 hops): NotificationSubscription.id
;;   → Notification.id (via sub.notification_id)
;;   → NotificationCard.id (via notification.payload_id, when payload_type = "notification/card")
;;   → cards.id (via notification_card.card_id)
(defn- translate-ids
  "Build {:alert {sub-id card-id} :dashboard-subscription {pulse-id dash-id}}."
  [pairs]
  (let [sub-ids   (into #{} (keep (fn [[t id]] (when (and (= t :alert) id) id))) pairs)
        pulse-ids (into #{} (keep (fn [[t id]]
                                    (when (and (= t :dashboard-subscription) id) id)))
                        pairs)
        sub->notif (when (seq sub-ids)
                     (t2/select-pk->fn :notification_id
                                       :model/NotificationSubscription
                                       :id [:in sub-ids]))
        notif-ids  (some-> sub->notif vals seq set)
        notif->payload (when (seq notif-ids)
                         ;; Filter payload_type client-side: applying it in a
                         ;; kwarg :where runs the model's keyword-enum
                         ;; validator on the value and rejects the lookup.
                         (into {}
                               (comp
                                (filter #(= (:payload_type %) :notification/card))
                                (map (juxt :id :payload_id)))
                               (t2/select [:model/Notification :id :payload_id :payload_type]
                                          :id [:in notif-ids])))
        payload-ids (some-> notif->payload vals seq set)
        payload->card (when (seq payload-ids)
                        (t2/select-pk->fn :card_id :model/NotificationCard
                                          :id [:in payload-ids]))
        sub->card  (into {}
                         (keep (fn [[s n]]
                                 (when-let [p (get notif->payload n)]
                                   (when-let [c (get payload->card p)]
                                     [s c]))))
                         sub->notif)
        pulse->dash (when (seq pulse-ids)
                      (t2/select-pk->fn :dashboard_id :model/Pulse
                                        :id [:in pulse-ids]))]
    {:alert                  (or sub->card {})
     :dashboard-subscription (or pulse->dash {})}))

(defn- task-run-target
  "Map a workload (type, entity-id) to the TaskRun (run-type, entity-type,
   entity-id) tuple, or nil if the job type isn't wrapped in TaskRun."
  [job-type entity-id translations]
  (case job-type
    :sync (when entity-id [:sync :database entity-id])
    :alert (when-let [card-id (get-in translations [:alert entity-id])]
             [:alert :card card-id])
    :dashboard-subscription (when-let [dash-id (get-in translations
                                                       [:dashboard-subscription entity-id])]
                              [:subscription :dashboard dash-id])
    nil))

(defn- fetch-latest-successes
  "One query: most recent successful TaskRun rows whose (run_type, entity_type,
   entity_id) matches any tuple in `targets`. Returns {tuple row}."
  [targets]
  (when (seq targets)
    (let [rows (t2/select [:model/TaskRun
                           :run_type :entity_type :entity_id
                           :started_at :ended_at]
                          {:where (into [:and [:= :status "success"]]
                                        [(into [:or]
                                               (for [[rt et eid] targets]
                                                 [:and
                                                  [:= :run_type (name rt)]
                                                  [:= :entity_type (name et)]
                                                  [:= :entity_id eid]]))])
                           :order-by [[:ended_at :desc]]})]
      ;; rows are ordered desc; keep the first hit per tuple.
      (reduce (fn [m row]
                (let [k [(:run_type row) (:entity_type row) (:entity_id row)]]
                  (if (contains? m k) m (assoc m k row))))
              {}
              rows))))

(defn- ->epoch-ms ^long [x]
  ;; Toucan returns timestamp columns as OffsetDateTime in most app DBs but
  ;; older code paths can hand back java.sql.Timestamp/java.util.Date. Handle
  ;; both rather than guess.
  (cond
    (nil? x) 0
    (instance? java.util.Date x) (.getTime ^java.util.Date x)
    :else (.toEpochMilli ^Instant (t/instant x))))

(defn- duration-ms [{:keys [started_at ended_at]}]
  (when (and started_at ended_at)
    (max 0 (- (->epoch-ms ended_at) (->epoch-ms started_at)))))

(defn enrich
  "Add `:last_run` to each workload slot row.
   Value: nil, or {:duration_ms N :run_type \"...\" :entity_type \"...\" :entity_id N}.
   The non-duration fields are the URL params for /admin/tools/tasks/runs."
  [rows]
  (let [pairs        (into #{} (map (juxt :type :entity_id)) rows)
        translations (translate-ids pairs)
        targets      (into [] (keep (fn [[t id]] (task-run-target t id translations))) pairs)
        latest       (fetch-latest-successes targets)]
    (mapv (fn [row]
            (let [target (task-run-target (:type row) (:entity_id row) translations)
                  hit    (when target
                           (get latest [(first target)
                                        (second target)
                                        (nth target 2)]))]
              (assoc row :last_run
                     (when hit
                       {:duration_ms (duration-ms hit)
                        :run_type    (name (first target))
                        :entity_type (name (second target))
                        :entity_id   (nth target 2)}))))
          rows)))
