(ns metabase-enterprise.dependencies.task.result-metadata-refresh
  "Implements a task that drains an in-memory set of cards etc. whose deps have been updated, and also need an update.

  Event listeners populate that set, and this background task drains it again. If the `:model/Dependency` graph is
  not populated for this instance (eg. because it's OSS) then this has no effect because no downstream dependencies
  will be found.

  This is fundamentally best-effort - the queue of updates lives in memory and is lost of power-off, and if the
  re-analysis of some key fails it still gets removed from the backlog of updates."
  (:require
   [better-cond.core :as b]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.scheduler :as qs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.dependencies.models.dependency :as deps.graph]
   [metabase-enterprise.dependencies.settings :as deps.settings]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.events.core :as events]
   [metabase.graph.core :as graph]
   [metabase.queries.core :as queries]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (org.quartz ObjectAlreadyExistsException)))

(set! *warn-on-reflection* true)

(defn- current-millis
  "Returns the current epoch millis. Uses java-time so that clock settings can be used in tests."
  []
  (t/to-millis-from-epoch (t/instant)))

(def ^:private state
  "A map `{:card {123 time-of-update}}` for dependencies. The first key is the type as used by `:model/Dependency`,
  then the ID of the transform, card, etc. The time is used to skip entities which have already been updated since
  the upstream update."
  (atom {:refresh-needed {}
         :running?       false}))

(def ^:private failed-refreshes
  "A map `{:card {123 Exception}}` of failed card refreshes."
  (atom {}))

(declare ^:private card-updated!)

(defn- refresh-card!
  "Given a card ID and the time at which something upstream last changed, refresh that card's `:result_metadata`.

  Does nothing if the card has been updated since the upstream change, eg. by a different branch of downstream updates.

  Returns the `:status` for sending to Prometheus: `:card-missing`, `:already-updated`, `:infer-failed`, `:refreshed`,
  `:exception` or `:unchanged`."
  [card-id upstream-changed-at]
  (if-let [card (t2/select-one :model/Card :id card-id)]
    (if (>= (t/to-millis-from-epoch (:updated_at card)) upstream-changed-at)
      :already-updated
      (try
        (let [new-metadata (queries/infer-metadata-with-model-overrides (:dataset_query card) card)]
          ;; The inferred metadata can be nil if there's an error processing the query - don't update in that case.
          (cond
            (not new-metadata) (do (log/debugf "Could not infer metadata for Card %d; not updating" card-id)
                                   :failed)

            (not= new-metadata (:result_metadata card))
            (do (log/debugf "Metadata of Card %d has changed - updating appDB" card-id)
                ;; Raw update because `queries.models.card/update-card!` tries to add Revisions etc. and this isn't
                ;; a real, user-driven update.
                (t2/update! :model/Card card-id {:result_metadata new-metadata})
                ;; Manually add this card's downstream deps to the queue; it won't be automatically triggered.
                (card-updated! card-id)
                :refreshed)

            :else (do (log/debugf "Metadata unchanged for Card %d; skipping the update" card-id)
                      :unchanged)))
        (catch Exception e
          (swap! failed-refreshes assoc-in [:card card-id] e)
          :exception)))
    :card-missing))

(defn- random-target
  "Randomly chooses a target entity from the [[state]] map, and removes it.

  Returns `[entity-type entity-id upstream-changed-at]` for the removed entry.
  Returns nil if the map is empty."
  []
  (let [target (volatile! nil)]
    (swap! state
           (fn [{needed :refresh-needed :as s}]
             (if (empty? needed)
               s
               (let [entity-type (rand-nth (keys needed))
                     entity-id   (rand-nth (keys (get needed entity-type)))]
                 (vreset! target [entity-type entity-id (get-in needed [entity-type entity-id])])
                 (m/dissoc-in s [:refresh-needed entity-type entity-id])))))
    @target))

(defn- refresh-result-metadata!
  "Job to refresh a single card's `:result_metadata`.

  Returns the number of things updated in this batch."
  []
  (loop [refreshed     0
         refresh-limit (deps.settings/card-metadata-refresh-batch-size)]
    (if (zero? refresh-limit)
      refreshed
      (if-let [[entity-type entity-id upstream-changed-at] (random-target)]
        (do (log/debugf "Refreshing metadata for %s %d because something upstream changed" entity-type entity-id)
            (case entity-type
              :card (u/prog1 (refresh-card! entity-id upstream-changed-at)
                      (prometheus/inc! :metabase-card-refresh/result {:status (str <>)}))
              (log/infof "Unexpected %s %d in the refresh-result-metadata queue" entity-type entity-id))
            (recur (inc refreshed) (dec refresh-limit)))
        ;; No target, so the queue if empty.
        refreshed))))

(defn- non-idle-interval
  "`delay-ms` plus/minus up to `variance-ms`, but never less than 10x the time it took to execute the previous batch."
  [last-batch-ms]
  (let [variance-ms (deps.settings/card-metadata-refresh-variance-ms)
        adjustment  (- (rand-int (* 2 variance-ms))
                       variance-ms)
        base-ms     (deps.settings/card-metadata-refresh-delay-ms)]
    (max (* 10 last-batch-ms)
         (+ base-ms adjustment))))

(declare ^:private schedule-next-run!)

(task/defjob
  ^{:doc "Refreshing :result_metadata for cards that have had something change upstream."
    ;; It's fine for this to run simultaneously on each instance, since the queue is in memory!
    org.quartz.DisallowConcurrentExecution false}
  RefreshResultMetadata [ctx]
  (log/info "Executing RefreshResultMetadata job...")
  (swap! state assoc :running? true)
  (let [start-time    (t/instant)
        n-refreshed   (refresh-result-metadata!)
        end-time      (t/instant)
        elapsed-ms    (t/time-between start-time end-time :millis)
        delay-ms      (non-idle-interval elapsed-ms)]
    (log/infof "Refreshed result_metdata for %d cards in %.2f seconds" n-refreshed (double (/ elapsed-ms 1000)))
    (let [{:keys [refresh-needed]} (swap! state assoc :running? false)]
      (if (empty? refresh-needed)
        (log/debug "Not scheduling next run - no work in the queue")
        (schedule-next-run! delay-ms (.getScheduler ctx))))))

(def ^:private job-key     "metabase.task.card-metadata-refresh.job")
(def ^:private trigger-key "metabase.task.card-metadata-refresh.trigger")

(defn- schedule-next-run!
  ([delay-ms] (schedule-next-run! delay-ms nil))
  ([delay-ms scheduler]
   (let [start-at (java.util.Date. (long (+ (current-millis) delay-ms)))
         trigger  (triggers/build
                   (triggers/with-identity (triggers/key (str trigger-key \. (random-uuid))))
                   (triggers/for-job job-key)
                   (triggers/start-at start-at))]
     (log/debug "Scheduling next run at" start-at)
     (b/cond
       ;; first schedule
       (not scheduler)
       (let [job (jobs/build (jobs/of-type RefreshResultMetadata) (jobs/with-identity job-key))]
         (log/debug "Scheduling for the first time")
         (task/schedule-task! job trigger))

       ;; Already scheduled, just let it run then.
       :let [triggers (qs/get-triggers-of-job scheduler job-key)]
       (seq triggers) (log/debugf "Existing schedule, letting it run: %s" (pr-str triggers))

       ;; No next run scheduled, so schedule one.
       :else          (qs/add-trigger scheduler trigger)))))

(defn- schedule-now! []
  (schedule-next-run! (rand-int (deps.settings/card-metadata-refresh-variance-ms))))

(add-watch state ::watch
           (fn [_key _ref old-value new-value]
             (prometheus/set! :metabase-card-refresh/pending-refreshes
                              (transduce (map count) + 0
                                         (vals (:refresh-needed new-value))))
             (when (and (empty? (:refresh-needed old-value))
                        (seq (:refresh-needed new-value)))
               (log/debug "Work added to empty queue - maybe rescheduling")
               (if (:running? new-value)
                 (log/debug "Job is running now - don't reschedule yet.")
                 (try
                   (log/debug "Job is not running - schedule it!")
                   (schedule-now!)
                   (catch ObjectAlreadyExistsException _
                     (log/debug "Failed to schedule job, a trigger already exists")))))))

(defmethod task/init! ::RefreshResultMetadata [_]
  (if (pos? (deps.settings/card-metadata-refresh-batch-size))
    (schedule-now!)
    (log/info "Not starting card metadata refresh job because the batch size is not positive")))

;; Queueing up things to run.
(derive :event/sync-metadata-end         ::event.database-synced)
(derive :event/table-manual-sync-success ::event.table-synced)
(derive :event/card-update               ::event.card-updated)
(derive :event/table-manual-sync-success :metabase/event)

(defn- card-deps-of [entity-type entity-id]
  (let [k          [entity-type entity-id]
        dependents (-> (deps.graph/graph-dependents)
                       (graph/children-of [k])
                       (get k))]
    (filter (comp #{:card} first) dependents)))

(defn- add-refreshes [needed deps]
  (let [now (current-millis)]
    (reduce #(assoc-in %1 %2 now) needed deps)))

(defn- card-updated! [card-id]
  (when-let [cards (seq (card-deps-of :card card-id))]
    (log/debugf "Card %d was updated - queueing %d downstream cards for metadata refresh" card-id (count cards))
    (swap! state update :refresh-needed add-refreshes cards)))

(methodical/defmethod events/publish-event! ::event.card-updated [_topic {card :object}]
  (card-updated! (:id card)))

(methodical/defmethod events/publish-event! ::event.table-synced [topic {table :object}]
  (when-let [cards (seq (card-deps-of :table (:id table)))]
    (log/debugf "Table %d was force-synced - queueing %d downstream cards for metadata refresh %s" (:id table) (count cards)
                topic)
    (swap! state update :refresh-needed add-refreshes cards)))

(methodical/defmethod events/publish-event! ::event.database-synced [_topic {db-id :database_id}]
  (let [tables (mapv #(vector :table %)
                     (t2/select-pks-set :model/Table :db_id db-id))
        deps   (graph/children-of (deps.graph/graph-dependents) tables)
        cards  (into #{} (comp cat
                               (filter (comp #{:card} first)))
                     (vals deps))]
    (when (seq cards)
      (log/debugf "Database %d was synced, updating %d tables - queueing %d downstream cards for metadata refresh"
                  db-id (count tables) (count cards))
      (swap! state update :refresh-needed add-refreshes cards))))
