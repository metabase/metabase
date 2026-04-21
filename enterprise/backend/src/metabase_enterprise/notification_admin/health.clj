(ns metabase-enterprise.notification-admin.health
  "Compute `:health` and `:last_sent_at` for notification-admin rows.

  The real send outcome lives on `:model/TaskRun` (status `:success|:failed|:abandoned`). We locate
  TaskRuns for a notification by walking recent `notification-send` `task_history` rows and
  following their `:run_id` to the corresponding TaskRun — a notification's id lives inside
  `task_details` (JSON), so we scan a bounded, time-windowed slice in memory. See
  [[task-history-lookback-days]] and [[task-history-row-limit]].

  Why TaskRun instead of task_history: a `notification-send` task_history row marks the parent
  fire as `:success` even when an individual channel-send child fails (exceptions are caught per
  handler in `metabase.notification.send/send-notification-sync!`). `task_run.complete-task-run!`
  correctly rolls the run status up from ALL child task_history rows, so a failing channel send
  properly flips the run's status to `:failed`."
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

(defn- latest-task-run-by-notification
  "Return `{notification-id {:latest {:status :ended_at} :last-sent <instant>}}` for each
  notification, where `:latest` is the most recent TaskRun and `:last-sent` is the ended_at of the
  most recent `:success` TaskRun. Bounded by time + row cap — see ns docs."
  [nids]
  (when (seq nids)
    (let [nid-set  (set nids)
          cutoff   (t/minus (t/offset-date-time) (t/days task-history-lookback-days))
          ;; Pull the `notification-send` task_history rows that link to a run, newest first, so
          ;; the per-notification run_id list comes out ordered.
          th-rows  (t2/select [:model/TaskHistory :run_id :task_details]
                              :task "notification-send"
                              {:where    [:and [:> :ended_at cutoff] [:not= :run_id nil]]
                               :order-by [[:ended_at :desc]]
                               :limit    task-history-row-limit})
          nid->run-ids (reduce
                        (fn [acc {:keys [run_id task_details]}]
                          ;; `do-with-task-history` rewrites task_details on failure into
                          ;; `{:status :failed :message ... :original-info <caller's task_details>}`,
                          ;; so notification_id can live at either level.
                          (let [nid (or (:notification_id task_details)
                                        (get-in task_details [:original-info :notification_id]))]
                            (if (and nid run_id (contains? nid-set nid))
                              (update acc nid (fnil conj []) run_id)
                              acc)))
                        {}
                        th-rows)
          all-run-ids (into #{} cat (vals nid->run-ids))
          runs        (if (seq all-run-ids)
                        (u/index-by :id (t2/select [:model/TaskRun :id :status :ended_at]
                                                   :id [:in all-run-ids]))
                        {})]
      (into {}
            (keep (fn [[nid run-ids]]
                    (let [ordered   (keep runs run-ids)
                          latest    (first ordered)
                          last-sent (some #(when (= :success (:status %)) %) ordered)]
                      (when latest
                        [nid {:latest    {:status   (:status latest)
                                          :ended_at (:ended_at latest)}
                              :last-sent (:ended_at last-sent)}]))))
            nid->run-ids))))

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
        run-info          (latest-task-run-by-notification nids)]
    (mapv
     (fn [row]
       (let [nid     (:id row)
             latest  (get-in run-info [nid :latest])
             sent-at (get-in run-info [nid :last-sent])
             health  (cond
                       (contains? orphan-cards nid)      :orphaned_card
                       (contains? orphan-creators nid)   :orphaned_creator
                       (= :failed    (:status latest))   :failing
                       (= :abandoned (:status latest))   :abandoned
                       :else                              :healthy)]
         (assoc row :health health :last_sent_at sent-at)))
     rows)))
