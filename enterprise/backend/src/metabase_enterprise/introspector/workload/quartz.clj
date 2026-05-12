(ns metabase-enterprise.introspector.workload.quartz
  "Quartz scheduler access + cron projection.

   Public functions:
   - (running?)               -> bool: is the scheduler started?
   - (grid from to opts)      -> {:cells [...] :scale_max n :scheduler_status \"running|stopped\"}
   - (slot from to opts)      -> [{:type :entity_id :entity_name :cron :fire_at :weight :settings_url}...]"
  (:require
   [metabase-enterprise.introspector.workload.weights :as weights]
   [metabase.task.core :as task]
   [toucan2.core :as t2])
  (:import
   (java.time Instant ZoneOffset)
   (org.quartz CronExpression CronTrigger Scheduler SimpleTrigger Trigger TriggerKey)))

(set! *warn-on-reflection* true)

(def ^:private max-fires-per-trigger
  "Sanity cap — a trigger firing more than this many times in the window is treated
   as misconfigured. See spec edge-case table."
  2000)

;;; ---------------------------------------------------------------- scheduler

(defn- ^Scheduler scheduler [] (task/scheduler))

(defn running? []
  (try
    (some-> (scheduler) .isStarted)
    (catch Throwable _ false)))

(defn- all-triggers []
  (let [s (scheduler)]
    (when s
      (->> (.getTriggerKeys s nil)
           (map (fn [^TriggerKey k] (.getTrigger s k)))
           (remove nil?)))))

;;; ---------------------------------------------------------------- parse-trigger

(defn parse-trigger
  "Identify (job-type, entity-id) from a trigger's job key + data map.
   Group strings below are placeholders — verify against actual scheduling code on
   first run via `(map #(.getGroup (.getJobKey %)) (all-triggers))`."
  [^Trigger trigger]
  (let [jk    (.getJobKey trigger)
        group (.getGroup jk)
        data  (.getJobDataMap trigger)
        as-long #(when % (try (long (Long/parseLong (str %))) (catch Throwable _ nil)))]
    (case group
      "metabase-sync"             {:type :sync              :id (as-long (.get data "db-id"))}
      "transforms.scheduling"     {:type :transform-job     :id (as-long (.get data "job-id"))}
      "notification-send"         {:type :notification      :id (as-long (.get data "notification-id"))}
      "PersistRefresh"            {:type :persisted-refresh :id (as-long (.get data "db-id"))}
      {:type :other :id nil})))

;;; ---------------------------------------------------------------- projection

(defn- ^Instant to-instant [^java.util.Date d]
  (when d (.toInstant d)))

(defn- cron-fires
  "Lazy-ish seq of Instants for a CronTrigger in the half-open window [from, to)."
  [^CronTrigger ct ^Instant from ^Instant to]
  (let [^CronExpression cron (CronExpression. (.getCronExpression ct))]
    (loop [cursor (java.util.Date/from from)
           acc    (transient [])]
      (let [^java.util.Date next (.getNextValidTimeAfter cron cursor)]
        (cond
          (nil? next)                                   (persistent! acc)
          (>= (count acc) max-fires-per-trigger)        (persistent! acc)
          (not (.before next (java.util.Date/from to))) (persistent! acc)
          :else (recur next (conj! acc (.toInstant next))))))))

(defn- simple-fires
  "Fires for non-cron SimpleTrigger using its start time + repeat interval."
  [^SimpleTrigger st ^Instant from ^Instant to]
  (let [start (to-instant (.getStartTime st))
        ^Instant end (or (to-instant (.getEndTime st)) to)
        interval (.getRepeatInterval st)]
    (if (or (nil? start) (not (pos? interval)))
      []
      (loop [^Instant cursor start, acc (transient [])]
        (cond
          (>= (count acc) max-fires-per-trigger) (persistent! acc)
          (.isAfter cursor end)                  (persistent! acc)
          (not (.isBefore cursor to))            (persistent! acc)
          :else (let [keep? (not (.isBefore cursor from))]
                  (recur (.plusMillis cursor interval)
                         (cond-> acc keep? (conj! cursor)))))))))

(defn- fires-of
  [^Trigger trig ^Instant from ^Instant to]
  (cond
    (instance? CronTrigger trig)   (cron-fires trig from to)
    (instance? SimpleTrigger trig) (simple-fires trig from to)
    :else                           []))

(defn- bucket-key
  "(day, hour) UTC key for an Instant."
  [^Instant inst]
  (let [zdt (.atZone inst ZoneOffset/UTC)]
    {:day  (str (.toLocalDate zdt))
     :hour (.getHour zdt)}))

;;; ---------------------------------------------------------------- grid

(defn- type-filter-fn [types]
  (if (seq types) (set (map keyword types)) (constantly true)))

(defn grid
  "Compute the hour-bucket grid for [from, to). Returns cells aggregated across all
   matched triggers, plus the scale_max for FE color binning."
  [^Instant from ^Instant to {:keys [types]}]
  (if-not (running?)
    {:cells [] :scale_max 0 :scheduler_status "stopped"}
    (let [keep-type? (type-filter-fn types)
          buckets    (volatile! (transient {}))]
      (doseq [trig (all-triggers)
              :let [{:keys [type id]} (parse-trigger trig)]
              :when (keep-type? type)
              ^Instant fire (fires-of trig from to)]
        (let [w   (weights/weight-for type id)
              bk  (bucket-key fire)
              cur (get @buckets bk {:day (:day bk) :hour (:hour bk) :weight 0 :by_type {}})
              upd (-> cur
                      (update :weight + w)
                      (update-in [:by_type type] (fnil + 0) w))]
          (vswap! buckets assoc! bk upd)))
      (let [cells (vec (vals (persistent! @buckets)))]
        {:cells cells
         :scale_max (or (some-> (seq cells) (->> (map :weight) (apply max))) 0)
         :scheduler_status "running"}))))

;;; ---------------------------------------------------------------- slot

(defn- ^String settings-url-for [{:keys [type id]}]
  (case type
    :sync              (when id (str "/admin/databases/" id))
    :transform-job     (when id (str "/admin/transforms/jobs/" id))
    :notification      (when id "/account/notifications")
    :persisted-refresh (when id "/admin/performance")
    nil))

(defn- entity-name-for [{:keys [type id]}]
  (when id
    (case type
      :sync              (:name (t2/select-one [:model/Database :name] :id id))
      :transform-job     (:name (t2/select-one [:model/TransformJob :name] :id id))
      :notification      (:name (t2/select-one [:model/Pulse :name] :id id))
      :persisted-refresh (str "DB " id " persisted refresh")
      nil)))

(defn slot
  "Enumerate the jobs scheduled in [from, to) — typically a single hour."
  [^Instant from ^Instant to {:keys [types]}]
  (if-not (running?)
    []
    (let [keep-type? (type-filter-fn types)]
      (vec
       (for [trig (all-triggers)
             :let [parsed (parse-trigger trig)
                   {:keys [type id]} parsed]
             :when (keep-type? type)
             ^Instant fire (fires-of trig from to)
             :let [cron (when (instance? CronTrigger trig)
                          (.getCronExpression ^CronTrigger trig))]]
         {:type         type
          :entity_id    id
          :entity_name  (entity-name-for parsed)
          :cron         cron
          :fire_at      (str fire)
          :weight       (weights/weight-for type id)
          :settings_url (settings-url-for parsed)})))))
