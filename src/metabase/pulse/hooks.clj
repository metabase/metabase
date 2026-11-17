(ns metabase.pulse.hooks
  "Hooks that keep the subscriptions of a Dashboard in step with its dashcards, its name and its Collection. The
  subscriptions follow the Cards of the dashcards, so Tabs and series do not matter."
  (:require
   [clojure.set :as set]
   [metabase.models.interface :as mi]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.pulse.models.pulse-card :as pulse-card]
   [metabase.util.write-batch :as write-batch]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- sync-subscriptions!
  "Update the names and Collection ids of the Pulses of the Dashboard `dashboard-id`, and sync their PulseCards with
  the dashcards the Dashboard has."
  [dashboard-id _data]
  (let [affected (pulse.db/pulse-card-pairs-for-dashboard dashboard-id)]
    (when-let [pulse-ids (seq (distinct (map :pulse-id affected)))]
      (when-let [dashboard (pulse.db/dashboard dashboard-id)]
        (let [correct-card-ids     (set (pulse.db/dashboard-card-ids-for-dashboard dashboard-id))
              stale-card-ids       (set (keep :card-id affected))
              cards-to-add         (set/difference correct-card-ids stale-card-ids)
              card-id->dashcard-id (when (seq cards-to-add)
                                     (pulse.db/dashcard-ids-by-card dashboard-id cards-to-add))
              positions-for        (fn [pulse-id] (drop (pulse-card/next-position-for pulse-id) (range)))
              new-pulse-cards      (for [pulse-id                         pulse-ids
                                         [[card-id dashcard-id] position] (map vector
                                                                               card-id->dashcard-id
                                                                               (positions-for pulse-id))]
                                     {:pulse_id          pulse-id
                                      :card_id           card-id
                                      :dashboard_card_id dashcard-id
                                      :position          position})]
          (t2/with-transaction [_conn]
            (binding [models.pulse/*allow-moving-dashboard-subscriptions* true]
              (pulse.db/update-pulses-for-dashboard! dashboard-id {:name          (:name dashboard)
                                                                   :collection_id (:collection_id dashboard)})
              (pulse-card/bulk-create! new-pulse-cards))))))))

(defn- mark-dashboard!
  "Have the subscriptions of the Dashboard `dashboard-id` synced once the batch of writes ends."
  [dashboard-id]
  (write-batch/mark! [::dashboard dashboard-id] (constantly nil) (partial sync-subscriptions! dashboard-id)))

(defn after-insert
  "Hook for `row` of `model` after it is inserted."
  [model row]
  (when (= model :model/DashboardCard)
    (mark-dashboard! (:dashboard_id row))))

(defn before-update
  "Hook for `row` of `model` before it is updated."
  [model row]
  (let [changes (t2/changes row)]
    (case model
      :model/Dashboard     (when (or (contains? changes :name) (contains? changes :collection_id))
                             (mark-dashboard! (:id row)))
      :model/DashboardCard (when (or (contains? changes :card_id) (contains? changes :dashboard_id))
                             (mark-dashboard! (:dashboard_id row)))
      nil)))

(defn before-delete
  "Hook for `row` of `model` before it is deleted."
  [model row]
  (when (= model :model/DashboardCard)
    (mark-dashboard! (:dashboard_id row))))

(mi/define-hook-trait :hook/pulse
  {:after-insert  after-insert
   :before-update before-update
   :before-delete before-delete})
