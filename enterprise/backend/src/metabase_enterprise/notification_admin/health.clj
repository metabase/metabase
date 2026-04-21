(ns metabase-enterprise.notification-admin.health
  "Compute `:health` and `:last_sent_at` for notification-admin rows.

  Health is derived from three signals:
    - `orphaned_card`: the notification's target card is missing or archived.
    - `orphaned_creator`: the notification's creator is a deactivated user.
    - Most recent alert-type `:model/TaskRun` for the notification's card:
      `:failed` → `:failing`, `:abandoned` → `:abandoned`, `:success` → healthy.

  Granularity note: TaskRuns are keyed by `(run_type=:alert, entity_type=:card, entity_id=<card-id>)`.
  If multiple notifications share a card, they share the run status. For v1 we accept that
  approximation — it matches what admins see on `Tasks > Runs` filtered by card."
  (:require
   [java-time.api :as t]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private task-run-lookback-days
  "Only consider TaskRuns from the last N days when computing health. Anything older is treated as
  if no send has happened."
  90)

(defn- nid->card-id
  "Return `{notification-id card-id}` for the given notification ids, joining through
  `notification_card`. Non-card-type notifications don't appear in the map."
  [nids]
  (when (seq nids)
    (u/index-by :notification_id :card_id
                (t2/query {:select [[:notification.id :notification_id]
                                    [:notification_card.card_id :card_id]]
                           :from   [:notification]
                           :join   [:notification_card
                                    [:= :notification_card.id :notification.payload_id]]
                           :where  [:and
                                    [:= :notification.payload_type "notification/card"]
                                    [:in :notification.id nids]]}))))

(defn- card->archived?
  [card-ids]
  (if (seq card-ids)
    (t2/select-fn->fn :id :archived :model/Card :id [:in card-ids])
    {}))

(defn- inactive-creator-ids
  "Return the set of creator-ids (from the given notifications) that point to deactivated or
  missing users."
  [nid+creator-pairs]
  (let [creator-ids (->> nid+creator-pairs (map second) (remove nil?) set)
        ;; :model/User's default-fields selection omits :is_active; project it explicitly.
        active?     (if (seq creator-ids)
                      (u/index-by :id :is_active
                                  (t2/select [:model/User :id :is_active] :id [:in creator-ids]))
                      {})]
    (into #{} (keep (fn [[nid creator-id]]
                      (when (or (nil? creator-id) (not (get active? creator-id)))
                        nid)))
          nid+creator-pairs)))

(defn- latest-run-by-card
  "Return `{card-id {:status :ended_at}}` for each card's most recent alert-type TaskRun within
  the lookback window."
  [card-ids]
  (when (seq card-ids)
    (let [cutoff (t/minus (t/offset-date-time) (t/days task-run-lookback-days))
          runs   (t2/select [:model/TaskRun :entity_id :status :ended_at :started_at]
                            {:where    [:and
                                        [:= :run_type "alert"]
                                        [:= :entity_type "card"]
                                        [:in :entity_id card-ids]
                                        [:> :started_at cutoff]]
                             :order-by [[:started_at :desc]]})]
      (reduce (fn [acc {:keys [entity_id status ended_at]}]
                (if (contains? acc entity_id)
                  acc
                  (assoc acc entity_id {:status status :ended_at ended_at})))
              {}
              runs))))

(defn compute-for-rows
  "Given a seq of notification rows (at minimum `:id` and `:creator_id`), return them assoc'd with
  `:health` (one of `:healthy | :orphaned_card | :orphaned_creator | :failing | :abandoned` —
  precedence in that order) and `:last_sent_at` (ended_at of the most recent successful run for
  the card, or nil)."
  [rows]
  (let [rows         (vec rows)
        nids         (map :id rows)
        nid->card    (nid->card-id nids)
        card-ids     (set (vals nid->card))
        archived?    (card->archived? card-ids)
        orphan-users (inactive-creator-ids (map (juxt :id :creator_id) rows))
        card->run    (latest-run-by-card card-ids)]
    (mapv
     (fn [row]
       (let [nid      (:id row)
             cid      (get nid->card nid)
             run      (get card->run cid)
             health   (cond
                        (or (nil? cid) (true? (get archived? cid))) :orphaned_card
                        (contains? orphan-users nid)                :orphaned_creator
                        (= :failed    (:status run))                :failing
                        (= :abandoned (:status run))                :abandoned
                        :else                                        :healthy)
             sent-at  (when (= :success (:status run)) (:ended_at run))]
         (assoc row :health health :last_sent_at sent-at)))
     rows)))
