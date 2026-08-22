(ns metabase.test.data.bigquery-cloud-sdk.dataset-state
  "Lifecycle state of a BigQuery test dataset, as recorded in its dataset labels, and the retention policy the reaper
  applies to it.

  Two tiers of dataset live in the test project:

  - *gold*: content-addressed, built once, never written to afterwards, shared by every branch that derives the same
    hash. Marked `state=ready` only once every table is loaded.
  - *work*: created by a single test, written to, and dropped when it finishes. Marked `ephemeral=true` and given a
    table expiration so an abandoned one costs nothing.

  `state` is what makes publishing atomic. A dataset exists from the moment loading starts, so its existence says
  nothing about whether its tables have rows; only the flip to `ready` does, and that is a single metadata write.

  Deliberately depends on nothing outside `clojure.core` and `java.time`, so the reaper can load it under Babashka
  without pulling in Metabase."
  (:import
   (java.time LocalDate)
   (java.time.format DateTimeParseException)))

(set! *warn-on-reflection* true)

(def retention
  "How long each kind of dataset is kept, and how often a gold dataset records that it is still in use.

  `touch-interval-days` bounds how often `last_used` is rewritten; `touch-jitter-days` spreads that write out across
  processes so they do not all rewrite the same dataset the moment the interval lapses. Retention must stay well
  above the two combined, or a dataset in active use can be reaped between touches."
  {:gold-retention-days 14
   :work-retention-days 1
   :touch-interval-days 1
   :touch-jitter-days   1})

(def ^:private state-label "state")
(def ^:private ephemeral-label "ephemeral")
(def ^:private last-used-label "last_used")

(defn day-stamp
  "`date` as a dataset label value.

  Label values admit only lowercase alphanumerics, dashes and underscores, so the leading `d` is load-bearing: a bare
  `20260822` is rejected by BigQuery."
  [^LocalDate date]
  (format "d%04d%02d%02d" (.getYear date) (.getMonthValue date) (.getDayOfMonth date)))

(defn- parse-day-stamp ^LocalDate [s]
  (when (and (string? s) (re-matches #"d\d{8}" s))
    (try
      (LocalDate/of (Integer/parseInt (subs s 1 5))
                    (Integer/parseInt (subs s 5 7))
                    (Integer/parseInt (subs s 7 9)))
      (catch DateTimeParseException _ nil)
      (catch java.time.DateTimeException _ nil))))

(defn building-labels
  "Labels a dataset is created with, before any table exists in it."
  [{:keys [ephemeral? today]}]
  {state-label     "building"
   ephemeral-label (if ephemeral? "true" "false")
   last-used-label (day-stamp today)})

(defn ready-labels
  "Labels that publish a dataset. Written as a complete set rather than a delta, so it does not matter whether
  BigQuery merges or replaces labels on update."
  [{:keys [ephemeral? today]}]
  (assoc (building-labels {:ephemeral? ephemeral?, :today today})
         state-label "ready"))

(defn touched-labels
  "`labels` with `last_used` moved to `today`, everything else preserved."
  [labels today]
  (assoc labels last-used-label (day-stamp today)))

(defn ready?
  "Whether a dataset carrying `labels` finished loading. A dataset with no labels at all predates this scheme and is
  not trusted: treating it as ready would reintroduce the race this state machine exists to close."
  [labels]
  (= "ready" (get labels state-label)))

(defn building?
  "Whether some process is loading this dataset right now, or died trying.

  Distinct from merely having no `ready`: a dataset with no state label at all was not created by this scheme, and
  waiting for a publisher that does not exist would block until the timeout."
  [labels]
  (= "building" (get labels state-label)))

(defn ephemeral?
  "Whether a dataset carrying `labels` belongs to a single test rather than being shared."
  [labels]
  (= "true" (get labels ephemeral-label)))

(defn- days-since [labels ^LocalDate today]
  (when-let [^LocalDate stamp (parse-day-stamp (get labels last-used-label))]
    (- (.toEpochDay today) (.toEpochDay stamp))))

(defn needs-touch?
  "Whether `last_used` should be rewritten today.

  `jitter-days` is supplied by the caller (rather than drawn here) both to keep this pure and so every process picks
  its own: without it they all cross the interval on the same day and write at once."
  [labels ^LocalDate today jitter-days]
  (if-let [elapsed (days-since labels today)]
    (>= elapsed (+ (:touch-interval-days retention) jitter-days))
    true))

(defn reapable?
  "Whether a dataset carrying `labels` should be deleted.

  Three ways to qualify: a work dataset whose test is long gone, a gold dataset nothing has used in a fortnight, and
  a dataset still marked `building` well past any plausible load - the residue of a process that died mid-build,
  which nothing will ever finish and [[ready?]] will never accept."
  [labels ^LocalDate today]
  (let [elapsed (days-since labels today)]
    (cond
      (nil? elapsed)      false ; unlabelled datasets predate this scheme; leave them to a deliberate sweep
      (ephemeral? labels) (>= elapsed (:work-retention-days retention))
      (not (ready? labels)) (>= elapsed (:work-retention-days retention))
      :else               (>= elapsed (:gold-retention-days retention)))))
