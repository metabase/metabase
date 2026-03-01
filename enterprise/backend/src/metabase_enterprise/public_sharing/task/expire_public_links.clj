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

(defn- expire-links-for-model!
  "Expire public links for a given model (Card or Dashboard) that have passed their expiry time."
  [model]
  (let [now        (java.time.Instant/now)
        candidates (t2/select model
                              {:select [:id :public_uuid :public_link_expires_at :public_link_expired]
                               :where  [:and
                                        [:not= :public_uuid nil]
                                        [:not= :public_link_expires_at nil]
                                        [:= :public_link_expired false]
                                        [:< :public_link_expires_at now]]})
        _          (log/infof "%s candidates to expire: %s" (name model) (pr-str candidates))
        expired    (reduce (fn [cnt {:keys [id]}]
                             (+ cnt (t2/update! model id {:public_link_expired true})))
                           0
                           candidates)]
    (log/infof "Expired %d %s links" expired (name model))
    expired))

(defn- expire-public-links!
  "Find all cards and dashboards with public links that have passed their expiry time
  and mark them as expired."
  []
  (log/infof "Running expire-public-links! job at %s" (java.time.Instant/now))
  (let [cards-expired      (expire-links-for-model! :model/Card)
        dashboards-expired (expire-links-for-model! :model/Dashboard)
        total              (+ cards-expired dashboards-expired)]
    (log/infof "Expire result: %d total (%d cards, %d dashboards)"
               total cards-expired dashboards-expired)))

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
