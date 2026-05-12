(ns metabase-enterprise.introspector.workload.quartz
  "Quartz scheduler access + cron projection.

   Public functions:
   - (running?)               -> bool: is the scheduler started?
   - (grid from to opts)      -> {:cells [...] :scale_max n :scheduler_status \"running|stopped\"}
   - (slot from to opts)      -> [{:type :entity_id :entity_name :cron :fire_at :weight :settings_url}...]"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.introspector.workload.weights :as weights]
   [metabase.task.core :as task]
   [metabase.task.impl :as task.impl]
   [metabase.util.log :as log]
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

(defn- ensure-standby!
  "If no Quartz scheduler is initialized yet (e.g. running with MB_DISABLE_SCHEDULER=true),
   bring one up in standby mode so we can enumerate triggers without firing jobs.
   Idempotent — `init-scheduler!` is a no-op when a scheduler already exists."
  []
  (when-not (scheduler)
    (try
      (task.impl/init-scheduler!)
      (log/info "Introspector workload lazily initialized Quartz scheduler in standby mode.")
      (catch Throwable e
        (log/warn e "Introspector workload could not initialize Quartz scheduler.")))))

(defn running?
  "True if a Quartz scheduler instance is available — even in standby mode.
   We don't need it to be actively firing jobs; we only read the registered triggers."
  []
  (try
    (ensure-standby!)
    (some? (scheduler))
    (catch Throwable _ false)))

(defn- all-triggers []
  (let [s (scheduler)]
    (when s
      (->> (.getTriggerKeys s nil)
           (map (fn [^TriggerKey k] (.getTrigger s k)))
           (remove nil?)))))

;;; ---------------------------------------------------------------- parse-trigger

(def ^:private trigger-name-patterns
  "Each entry: [regex job-type]. Group 1 of the regex (when present) captures the entity-id.
   Quartzite `jobs/key` defaults to `group=DEFAULT`, so the discriminator lives in the trigger
   NAME, not its group. Inspect live names via:
     (map #(-> % .getKey .getName) (all-triggers))

   Two notification systems exist:
   - :alert                 — new system, `metabase.task.notification.trigger.subscription.NN`
                              (NN = notification_subscription_id)
   - :dashboard-subscription — legacy pulse, `metabase.task.send-pulse.trigger.NN.<schedule>`
                              (NN = pulse_id, schedule = hashed schedule string)"
  [[#"metabase\.task\.sync-and-analyze\.trigger\.(\d+)"                :sync]
   [#"metabase\.task\.update-field-values\.trigger\.(\d+)"             :sync]
   [#"metabase\.task\.transforms\.trigger\.(\d+)"                      :transform-job]
   [#"metabase\.task\.notification\.trigger\.subscription\.(\d+)"      :alert]
   [#"metabase\.task\.send-pulse\.trigger\.(\d+)\..*"                  :dashboard-subscription]
   [#"metabase\.task\.PersistenceRefresh\.database\.trigger\.(\d+)"    :persisted-refresh]
   [#"metabase\.task\.PersistenceRefresh\.individual\.trigger\.(\d+)"  :persisted-refresh]
   [#"metabase\.task\.PersistencePrune\..*"                            :persisted-refresh]])

(defn parse-trigger
  "Return {:type :id} if the trigger matches a known entity-bound pattern; nil otherwise.
   Triggers we don't recognize are dropped from both grid and slot — they're typically
   system singletons (cleanups, indexing, etc.) that admins can't reschedule and that
   would otherwise show up as orphaned rows."
  [^Trigger trigger]
  (let [tname (.getName (.getKey trigger))]
    (some (fn [[re tp]]
            (when-let [m (re-matches re tname)]
              {:type tp
               :id   (when (sequential? m)
                       (try (Long/parseLong (second m)) (catch Throwable _ nil)))}))
          trigger-name-patterns)))

;;; ---------------------------------------------------------------- projection

(defn- ^Instant to-instant [^java.util.Date d]
  (when d (.toInstant d)))

(defn- cron-fires
  "Lazy-ish seq of Instants for a CronTrigger in the half-open window [from, to)."
  [^CronTrigger ct ^Instant from ^Instant to]
  (let [^CronExpression cron (CronExpression. (.getCronExpression ct))
        ;; Quartz's getNextValidTimeAfter is *strictly* after the cursor, so a
        ;; trigger firing at exactly `from` is missed when from itself sits on
        ;; a fire boundary (e.g. slot endpoint requests [08:00, 09:00) and the
        ;; cron fires hourly at :00). Back the cursor up by 1 ms so the fire AT
        ;; `from` is included.
        start (java.util.Date/from (.minusMillis from 1))]
    (loop [cursor start
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

(def ^:private bucket-minutes
  "Granularity of the heatmap in minutes. 60 -> hourly buckets."
  60)

(defn- bucket-key
  "(day, hour, minute) UTC key for an Instant. Minute is floored to the nearest
   `bucket-minutes` boundary."
  [^Instant inst]
  (let [zdt (.atZone inst ZoneOffset/UTC)]
    {:day    (str (.toLocalDate zdt))
     :hour   (.getHour zdt)
     :minute (* bucket-minutes (quot (.getMinute zdt) bucket-minutes))}))

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
          buckets    (volatile! (transient {}))
          ;; A trigger that fires hourly across a 7-day window produces 168
          ;; weight-for calls for the same (type, id) — each one a fresh
          ;; SQL count. Memoize for the duration of this request.
          weight-for (memoize weights/weight-for)]
      (doseq [trig (all-triggers)
              :let [parsed (parse-trigger trig)
                    {:keys [type id]} parsed]
              :when (and parsed (keep-type? type))
              ^Instant fire (fires-of trig from to)]
        (let [w   (weight-for type id)
              bk  (bucket-key fire)
              cur (get @buckets bk {:day    (:day bk)
                                    :hour   (:hour bk)
                                    :minute (:minute bk)
                                    :weight 0
                                    :by_type {}})
              upd (-> cur
                      (update :weight + w)
                      (update-in [:by_type type] (fnil + 0) w))]
          (vswap! buckets assoc! bk upd)))
      (let [cells (vec (vals (persistent! @buckets)))]
        {:cells cells
         :scale_max (or (some-> (seq cells) (->> (map :weight) (apply max))) 0)
         :scheduler_status "running"}))))

;;; ---------------------------------------------------------------- slot

(defn- creator-display-name
  "Render a user row as a label: 'First Last' if available, else email."
  [{:keys [first_name last_name email]}]
  (let [n (str/trim (str (or first_name "") " " (or last_name "")))]
    (if (str/blank? n) email n)))

(defn- bulk-creator-labels
  "Map of `user-id → label`. Missing users (deleted accounts) fall back to 'User #<id>'."
  [user-ids]
  (let [ids (->> user-ids (filter some?) distinct)]
    (when (seq ids)
      (let [rows  (t2/query {:select [:id :first_name :last_name :email]
                             :from   [:core_user]
                             :where  [:in :id ids]})
            by-id (into {} (map (juxt :id creator-display-name)) rows)]
        (reduce (fn [m id] (assoc m id (or (get by-id id) (str "User #" id))))
                {} ids)))))

(defn- bulk-entity-info
  "Resolve display metadata + settings URL for every (type, id) pair at once.
   Returns `{[type id] {:name :updated_at :creator :settings_url}}`.

   One query per entity table (4 total), then one query to resolve creator labels.
   Replaces the per-row N+1 in the old `entity-meta-for` (`:alert` was 3 sequential
   single-row SELECTs per id; on a 200-alert hour that's 600 round-trips)."
  [pairs]
  (let [pairs   (->> pairs distinct (filter (comp some? second)))
        by-type (group-by first pairs)
        ids-of  (fn [t] (vec (distinct (map second (get by-type t)))))
        db-ids       (vec (distinct (concat (ids-of :sync)
                                            (ids-of :persisted-refresh))))
        job-ids      (ids-of :transform-job)
        alert-ids    (ids-of :alert)
        sub-ids      (ids-of :dashboard-subscription)
        dbs-f    (future (when (seq db-ids)
                           (->> (t2/query {:select [:id :name :updated_at]
                                           :from   [:metabase_database]
                                           :where  [:in :id db-ids]})
                                (into {} (map (juxt :id identity))))))
        jobs-f   (future (when (seq job-ids)
                           (->> (t2/query {:select [:id :name :updated_at]
                                           :from   [:transform_job]
                                           :where  [:in :id job-ids]})
                                (into {} (map (juxt :id identity))))))
        alerts-f (future (when (seq alert-ids)
                           (->> (t2/query
                                 {:select    [[:ns.id        :subscription_id]
                                              [:n.id         :notification_id]
                                              [:n.creator_id :creator_id]
                                              [:n.updated_at :updated_at]
                                              [:c.id         :card_id]
                                              [:c.name       :card_name]]
                                  :from      [[:notification_subscription :ns]]
                                  :left-join [[:notification :n]      [:= :n.id :ns.notification_id]
                                              [:notification_card :nc] [:= :nc.id :n.payload_id]
                                              [:report_card :c]        [:= :c.id :nc.card_id]]
                                  :where     [:in :ns.id alert-ids]})
                                (into {} (map (juxt :subscription_id identity))))))
        pulses-f (future (when (seq sub-ids)
                           (->> (t2/query {:select [:id :name :updated_at :creator_id :dashboard_id]
                                           :from   [:pulse]
                                           :where  [:in :id sub-ids]})
                                (into {} (map (juxt :id identity))))))
        dbs    @dbs-f
        jobs   @jobs-f
        alerts @alerts-f
        pulses @pulses-f
        labels (bulk-creator-labels (concat (map :creator_id (vals alerts))
                                            (map :creator_id (vals pulses))))]
    (into {}
          (map (fn [[t id :as pair]]
                 (let [info (case t
                              (:sync :persisted-refresh)
                              (if-let [db (get dbs id)]
                                {:name (:name db) :updated_at (:updated_at db)
                                 :creator nil
                                 :settings_url (str "/admin/databases/" id)}
                                {:name (str (if (= t :sync) "Database" "DB")
                                            " #" id " (deleted)")
                                 :updated_at nil :creator nil :settings_url nil})

                              :transform-job
                              (if-let [job (get jobs id)]
                                ;; TransformJob doesn't carry a creator column.
                                {:name (:name job) :updated_at (:updated_at job)
                                 :creator nil
                                 :settings_url (str "/data-studio/transforms/jobs/" id)}
                                {:name (str "Transform job #" id " (deleted)")
                                 :updated_at nil :creator nil :settings_url nil})

                              :alert
                              (if-let [r (get alerts id)]
                                {:name (or (:card_name r)
                                           (str "Alert · notification #" (:notification_id r)))
                                 :updated_at (:updated_at r)
                                 :creator (get labels (:creator_id r))
                                 :settings_url (when-let [card-id (:card_id r)]
                                                 (str "/question/" card-id))}
                                {:name (str "Alert · subscription #" id " (deleted)")
                                 :updated_at nil :creator nil :settings_url nil})

                              :dashboard-subscription
                              (if-let [p (get pulses id)]
                                {:name (:name p) :updated_at (:updated_at p)
                                 :creator (get labels (:creator_id p))
                                 :settings_url (when-let [dash-id (:dashboard_id p)]
                                                 (str "/dashboard/" dash-id))}
                                {:name (str "Dashboard subscription #" id " (deleted)")
                                 :updated_at nil :creator nil :settings_url nil})

                              nil)]
                   [pair info])))
          pairs)))

(defn slot
  "Enumerate the jobs scheduled in [from, to) — typically a single hour."
  [^Instant from ^Instant to {:keys [types]}]
  (if-not (running?)
    []
    (let [keep-type? (type-filter-fn types)
          weight-for (memoize weights/weight-for)
          matched    (into []
                           (keep (fn [t]
                                   (when-let [parsed (parse-trigger t)]
                                     (when (keep-type? (:type parsed))
                                       {:trigger t :parsed parsed}))))
                           (all-triggers))
          info       (bulk-entity-info
                      (map (fn [{:keys [parsed]}] [(:type parsed) (:id parsed)])
                           matched))]
      (vec
       (for [{:keys [trigger parsed]} matched
             :let [{:keys [type id]} parsed]
             ^Instant fire (fires-of trigger from to)
             :let [cron (when (instance? CronTrigger trigger)
                          (.getCronExpression ^CronTrigger trigger))
                   meta (get info [type id])]]
         {:type         type
          :entity_id    id
          :entity_name  (:name meta)
          :updated_at   (some-> (:updated_at meta) str)
          :creator      (:creator meta)
          :cron         cron
          :fire_at      (str fire)
          :weight       (weight-for type id)
          :settings_url (:settings_url meta)})))))
