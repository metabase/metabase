(ns metabase-enterprise.introspector.workload.weights
  "Maps a Quartz trigger to its expected sub-operation count.
   One defmethod per job-type. Add new types here; everything else picks them up."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti weight-for
  "Expected number of sub-operations a trigger will produce on a single fire.
   Returns >= 1 — a job that fires is at least 1 unit of work."
  (fn [job-type _entity-id] job-type))

;; Sync fires per-table internally, so a linear table-count would dominate the heatmap
;; on instances with 10k+ tables. Use log2(tables) so a huge warehouse compresses into
;; a value comparable to a normal transform/notification:
;;   100 tables    -> 7
;;   1,000 tables  -> 10
;;   10,000 tables -> 14
;;   100,000       -> 17
(defmethod weight-for :sync [_ db-id]
  (let [tables (or (when db-id
                     (t2/count :model/Table
                               :db_id db-id
                               :active true
                               :visibility_type nil))
                   1)
        log2   (/ (Math/log (max 1 tables)) (Math/log 2))]
    (max 1 (int (Math/ceil log2)))))

;; A transform job is a set of tags; running it executes every transform that
;; shares any of those tags. Counting tag rows would understate jobs that fan out
;; to many transforms via a single tag. Count the distinct transforms instead.
(defmethod weight-for :transform-job [_ job-id]
  (let [tag-ids (when job-id
                  (t2/select-fn-set :tag_id :model/TransformJobTransformTag
                                    :job_id job-id))]
    (max 1
         (if (seq tag-ids)
           (count (t2/select-fn-set :transform_id :model/TransformTransformTag
                                    :tag_id [:in tag-ids]))
           1))))

(defmethod weight-for :persisted-refresh [_ db-id]
  (max 1 (or (when db-id
               (t2/count :model/PersistedInfo
                         :database_id db-id
                         :state "persisted"))
             1)))

;; Alerts use the new notification system.
;; id = notification_subscription_id; count the handlers on its parent notification.
(defmethod weight-for :alert [_ subscription-id]
  (max 1 (or (when subscription-id
               (when-let [notif-id (t2/select-one-fn :notification_id
                                                     :model/NotificationSubscription
                                                     :id subscription-id)]
                 (t2/count :model/NotificationHandler :notification_id notif-id)))
             1)))

;; Dashboard subscriptions still use the legacy pulse system.
;; id = pulse_id; cost is dominated by per-card sequential render (query +
;; chart). Linear in card count — a 100-card dashboard really is ~4× the work
;; of a 25-card one — but halved so big dashboards don't completely swamp
;; sync/transform rows in the heatmap. Channels barely contribute (they just
;; resend the already-rendered payload) so they're omitted.
;;   1 card   -> 1
;;   10 cards -> 5
;;   25 cards -> 13
;;   50 cards -> 25
;;   100      -> 50
(defmethod weight-for :dashboard-subscription [_ pulse-id]
  (or (when pulse-id
        (let [dashboard-id (t2/select-one-fn :dashboard_id :model/Pulse :id pulse-id)
              cards        (or (when dashboard-id
                                 (t2/count :model/DashboardCard
                                           :dashboard_id dashboard-id))
                               1)]
          (max 1 (int (Math/ceil (/ cards 2.0))))))
      1))

(defmethod weight-for :default [_ _] 1)
