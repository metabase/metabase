(ns metabase-enterprise.notification-admin.health
  "Health computation for notification-admin list rows.

  Given a sequence of card-type `:model/Notification` rows, [[compute-for-rows]] returns the
  same rows with two extra keys assoc'd on each: `:health` (a keyword, one of
  `:healthy | :orphaned_card | :orphaned_creator | :failing`) and `:last_sent_at` (the
  `ended_at` of the most recent `task_history` row with status `:success` for the notification,
  or `nil` if nothing has been sent successfully yet).

  Precedence when multiple states apply: `orphaned_card > orphaned_creator > failing > healthy`.

  Implementation strategy — we do three bulk queries (one to resolve card archival, one for creator
  activation, one to pull all `notification-send` task_history rows for the given ids) and then fold
  everything together in Clojure. `task_history.task_details` is a JSON-encoded text column; because
  the column type differs by backend and cross-DB JSON operators are not worth a dedicated
  abstraction for this one path, we pull the rows and group-by the deserialized
  `task_details.notification_id` in memory. Bounded by the page of notifications being shown."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- orphaned-card-ids
  "Return the set of notification ids (from `nids`) whose associated card is either missing or
  archived. Card-type notifications store the `card_id` on `notification_card`, joined via
  `notification.payload_id`."
  [nids]
  (when (seq nids)
    (let [;; notification-id -> card-id. We run a raw honeysql query (rather than a toucan2
          ;; model-backed select) because the result rows don't have the shape of any single
          ;; model — they're a join projection with just the two columns we care about.
          rows         (t2/query {:select [[:notification.id :notification_id]
                                           [:notification_card.card_id :card_id]]
                                  :from   [:notification]
                                  :join   [:notification_card
                                           [:= :notification_card.id :notification.payload_id]]
                                  :where  [:and
                                           [:= :notification.payload_type "notification/card"]
                                           [:in :notification.id nids]]})
          nid->card-id (into {} (map (juxt :notification_id :card_id)) rows)
          card-ids     (set (vals nid->card-id))
          ;; card-id -> archived?; missing keys means the card row doesn't exist
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
  "Return the set of notification ids whose `creator_id` is a deactivated (or missing) user.
  Note: `:model/User` has default fields that exclude `:is_active`, so we specify the columns
  we need explicitly instead of using `select-fn->fn` on the model alone."
  [nid+creator-pairs]
  (let [creator-ids (->> nid+creator-pairs (map second) (remove nil?) set)
        active?     (if (seq creator-ids)
                      (into {}
                            (map (juxt :id :is_active))
                            (t2/select [:model/User :id :is_active] :id [:in creator-ids]))
                      {})]
    (->> nid+creator-pairs
         (filter (fn [[_ creator-id]]
                   (or (nil? creator-id)
                       (not (get active? creator-id)))))
         (map first)
         set)))

(defn- latest-task-history-by-notification
  "Return a map of `notification-id -> {:status <keyword> :ended_at <timestamp>}` for the most
  recent `notification-send` task_history row per notification id in `nids`. Walks the rows in
  Clojure because `task_details.notification_id` lives inside a JSON text column and we don't
  want to paper over H2 / Postgres / MySQL JSON-operator differences for one query.

  Also returns, per notification, the `ended_at` of the most recent `:success` row — used for
  `:last_sent_at`."
  [nids]
  (when (seq nids)
    (let [nid-set (set nids)
          ;; Pull every notification-send row touching one of our ids, ordered newest first.
          rows    (t2/select [:model/TaskHistory :status :ended_at :task_details]
                             :task "notification-send"
                             {:order-by [[:ended_at :desc]]})]
      (reduce
       (fn [acc {:keys [status ended_at task_details]}]
         (let [nid (:notification_id task_details)]
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
  "Given a seq of notification rows (at minimum each needs `:id` and `:creator_id`), return the
  rows enriched with `:health` and `:last_sent_at` keys.

  See the namespace docstring for precedence rules and performance notes."
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
