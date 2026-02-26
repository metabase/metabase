(ns metabase-enterprise.public-sharing.task.expire-public-links
  "Background job that runs every 3 minutes to mark expired public links."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- expire-public-links!
  "Find all cards and dashboards with public links that have passed their expiry time
  and mark them as expired."
  []
  (let [now (java.time.Instant/now)
        cards-expired (t2/update! :model/Card
                                  {:public_link_expires_at [:< now]
                                   :public_link_expired    false
                                   :public_uuid            [:not= nil]}
                                  {:public_link_expired true})
        dashboards-expired (t2/update! :model/Dashboard
                                       {:public_link_expires_at [:< now]
                                        :public_link_expired    false
                                        :public_uuid            [:not= nil]}
                                       {:public_link_expired true})
        total (+ (or cards-expired 0) (or dashboards-expired 0))]
    (when (pos? total)
      (log/infof "Expired %d public links (%d cards, %d dashboards)"
                 total (or cards-expired 0) (or dashboards-expired 0)))))

(task/defjob
  ^{:doc "Periodic job to expire public links that have passed their expiry time."}
  ExpirePublicLinks [_]
  (expire-public-links!))

(def ^:private job-key     "metabase.task.expire-public-links.job")
(def ^:private trigger-key "metabase.task.expire-public-links.trigger")

(defmethod task/init! ::ExpirePublicLinks [_]
  (let [job     (jobs/build
                 (jobs/of-type ExpirePublicLinks)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; run every 3 minutes
                  (cron/cron-schedule "0 0/3 * * * ? *")))]
    (task/schedule-task! job trigger)))
