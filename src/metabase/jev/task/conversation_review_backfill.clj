(ns metabase.jev.task.conversation-review-backfill
  "Keeps `metabot_conversation_review` current: pages through conversations with no review, a review from an older
  question set, or messages newer than their review, and scores them. It reschedules itself, so a full backfill
  proceeds in bounded batches and, once caught up, new or continued conversations get scored on the next pass."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.jev.apps.conversations :as conversations]
   [metabase.jev.client :as jev]
   [metabase.task.core :as task]
   [metabase.util.log :as log])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private page-size 40)
(def ^:private parallelism 8)
(def ^:private startup-delay-seconds 60)
(def ^:private continuation-delay-seconds 5)
(def ^:private caught-up-delay-seconds 60)
(def ^:private no-key-retry-delay-seconds (* 60 60))

(def ^:private job-key (jobs/key "metabase.task.jev.conversation-review-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.jev.conversation-review-backfill.trigger"))

(defn- score-safely [conversation-id]
  (try
    (conversations/score! conversation-id)
    (catch Throwable e
      (log/warn e "Failed to review Metabot conversation" {:conversation-id conversation-id})
      {:status :failed :error (ex-message e)})))

(defn- run-page!
  "Score one page of pending conversations after `after-id`. Returns the counts, the cursor to continue from, and
  whether more pages remain."
  [after-id]
  (let [ids      (conversations/pending-conversation-ids after-id page-size)
        outcomes (into [] cat (pmap #(mapv score-safely %) (partition-all (max 1 (quot (count ids) parallelism)) ids)))]
    (assoc (frequencies (map :status outcomes))
           :cursor (last ids)
           :more?  (= page-size (count ids)))))

(declare schedule-run!)

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Review Metabot conversations with Jev, backfilling any without a current review."}
  ConversationReviewBackfill [ctx]
  (let [ctx      ^JobExecutionContext ctx
        after-id (get (qc/from-job-data ctx) "after-id")
        ;; The job only runs again because it schedules itself, so a failed pass must still schedule the next one.
        [cursor delay-seconds]
        (try
          (if-not (jev/key-present?)
            (do (log/info "Skipping Metabot conversation review: no Jev key is configured.")
                [nil no-key-retry-delay-seconds])
            (let [{:keys [cursor more?] :as result} (run-page! after-id)]
              (log/info "Metabot conversation review batch complete" (dissoc result :cursor))
              (if more?
                [cursor continuation-delay-seconds]
                [nil caught-up-delay-seconds])))
          (catch Throwable e
            (log/warn e "Metabot conversation review pass failed; retrying from the start")
            [nil caught-up-delay-seconds]))]
    (schedule-run! (.getScheduler ctx) cursor delay-seconds)))

(defn- build-job []
  (jobs/build
   (jobs/with-description "Review Metabot conversations with Jev")
   (jobs/of-type ConversationReviewBackfill)
   (jobs/with-identity job-key)))

(defn- build-trigger [after-id delay-seconds]
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/for-job job-key)
   (triggers/using-job-data (cond-> {} after-id (assoc "after-id" after-id)))
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long delay-seconds))))
   (triggers/with-schedule
    (simple/schedule (simple/with-misfire-handling-instruction-fire-now)))))

(defn- schedule-run! [scheduler after-id delay-seconds]
  (task/schedule-task! scheduler (build-job) (build-trigger after-id delay-seconds)))

(defn kick!
  "Start a pass from the beginning now, replacing any scheduled run."
  []
  (schedule-run! (task/scheduler) nil 1))

(defmethod task/init! ::ConversationReviewBackfill
  [_]
  (schedule-run! (task/scheduler) nil startup-delay-seconds))
