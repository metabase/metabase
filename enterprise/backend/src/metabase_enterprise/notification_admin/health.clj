(ns metabase-enterprise.notification-admin.health
  "Compute `:health` and `:last_sent_at` for notification-admin rows.

  `task_history.notification_id` is nested inside a JSON text column; the column type differs
  per backend and we don't want to paper over the JSON-operator differences for one path, so we
  fetch recent rows and group them in memory. The fetch is bounded by time window + row limit —
  see [[task-history-lookback-days]] and [[task-history-row-limit]]."
  (:require
   [java-time.api :as t]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private task-history-lookback-days
  "Only consider `notification-send` task_history rows from the last N days when computing health.
  A row older than this will be treated as if no send has happened."
  90)

(def ^:private task-history-row-limit
  "Hard cap on the number of `notification-send` rows we read to compute health. High enough to
  cover thousands of alerts × weeks of activity; low enough to keep worst-case memory bounded."
  50000)

(defn- orphaned-card-ids
  "Return the set of notification ids (from `nids`) whose associated card is missing or archived."
  [nids]
  (when (seq nids)
    (let [rows           (t2/query {:select [[:notification.id :notification_id]
                                             [:notification_card.card_id :card_id]]
                                    :from   [:notification]
                                    :join   [:notification_card
                                             [:= :notification_card.id :notification.payload_id]]
                                    :where  [:and
                                             [:= :notification.payload_type "notification/card"]
                                             [:in :notification.id nids]]})
          nid->card-id   (u/index-by :notification_id :card_id rows)
          card-ids       (set (vals nid->card-id))
          card->archived (if (seq card-ids)
                           (t2/select-fn->fn :id :archived :model/Card :id [:in card-ids])
                           {})]
      (->> nids
           (filter (fn [nid]
                     (let [cid (get nid->card-id nid)]
                       (or (nil? cid)
                           (not (contains? card->archived cid))
                           (true? (get card->archived cid))))))
           set))))

(defn- inactive-creator-ids
  "Return the set of notification ids whose `creator_id` is a deactivated (or missing) user."
  [nid+creator-pairs]
  (let [creator-ids (->> nid+creator-pairs (map second) (remove nil?) set)
        ;; `:model/User`'s default-fields selection omits `:is_active`, so we project it explicitly.
        active?     (if (seq creator-ids)
                      (u/index-by :id :is_active
                                  (t2/select [:model/User :id :is_active] :id [:in creator-ids]))
                      {})]
    (->> nid+creator-pairs
         (filter (fn [[_ creator-id]]
                   (or (nil? creator-id)
                       (not (get active? creator-id)))))
         (map first)
         set)))

(defn- latest-task-history-by-notification
  "Return `{notification-id {:latest {:status :ended_at} :last-sent <instant>}}` for the most
  recent `notification-send` row in the lookback window. Bounded by time + row cap — see ns docs."
  [nids]
  (when (seq nids)
    (let [nid-set (set nids)
          cutoff  (t/minus (t/offset-date-time) (t/days task-history-lookback-days))
          rows    (t2/select [:model/TaskHistory :status :ended_at :task_details]
                             :task "notification-send"
                             {:where    [:> :ended_at cutoff]
                              :order-by [[:ended_at :desc]]
                              :limit    task-history-row-limit})]
      (reduce
       (fn [acc {:keys [status ended_at task_details]}]
         ;; `do-with-task-history` rewrites task_details on failure into
         ;; `{:status :failed :message ... :original-info <caller's task_details>}`,
         ;; so notification_id can live at either level.
         (let [nid (or (:notification_id task_details)
                       (get-in task_details [:original-info :notification_id]))]
           (if (and nid (contains? nid-set nid))
             (cond-> acc
               (not (get-in acc [nid :latest]))
               (assoc-in [nid :latest] {:status status :ended_at ended_at})

               (and (= :success status)
                    (not (get-in acc [nid :last-sent])))
               (assoc-in [nid :last-sent] ended_at))
             acc)))
       {}
       rows))))

(defn compute-for-rows
  "Given a seq of notification rows (at minimum `:id` and `:creator_id`), return them assoc'd with
  `:health` (one of `:healthy | :orphaned_card | :orphaned_creator | :failing` — precedence in
  that order) and `:last_sent_at` (ended_at of the most recent successful send, or nil)."
  [rows]
  (let [rows              (vec rows)
        nids              (map :id rows)
        nid+creator-pairs (map (juxt :id :creator_id) rows)
        orphan-cards      (orphaned-card-ids nids)
        orphan-creators   (inactive-creator-ids nid+creator-pairs)
        task-info         (latest-task-history-by-notification nids)]
    (mapv
     (fn [row]
       (let [nid     (:id row)
             latest  (get-in task-info [nid :latest])
             sent-at (get-in task-info [nid :last-sent])
             health  (cond
                       (contains? orphan-cards nid)    :orphaned_card
                       (contains? orphan-creators nid) :orphaned_creator
                       (= :failed (:status latest))    :failing
                       :else                            :healthy)]
         (assoc row :health health :last_sent_at sent-at)))
     rows)))
