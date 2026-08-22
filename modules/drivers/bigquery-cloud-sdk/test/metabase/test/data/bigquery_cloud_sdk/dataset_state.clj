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

  Depends on nothing from Metabase, so a scheduled reaper can load it without starting the app."
  (:require
   [clojure.string :as str]
   [java-time.api :as t])
  (:import
   (java.time Duration LocalDate)))

(set! *warn-on-reflection* true)

(def retention
  "How long each kind of dataset is kept, and how often a gold dataset records that it is still in use.

  `touch-interval` bounds how often `last_used` is rewritten; `touch-jitter` spreads that write out across processes
  so they do not all rewrite the same dataset the moment the interval lapses. Gold retention must stay above the two
  combined, or a dataset in active use can be reaped between touches - [[dataset-state-test]] asserts this."
  {:gold-retention (t/duration 14 :days)
   :work-retention (t/duration 1 :days)
   :touch-interval (t/duration 1 :days)
   :touch-jitter   (t/duration 1 :days)})

(def ^:private state-label "state")
(def ^:private ephemeral-label "ephemeral")
(def ^:private last-used-label "last_used")

(def ^:private day-stamp-prefix
  "Label values may not begin with a digit, so an ISO date needs a leading letter to be legal."
  "d")

(defn day-stamp
  "`date` as a dataset label value: an ISO date behind [[day-stamp-prefix]].

  ISO keeps the value inside BigQuery's charset for labels, which allows dashes."
  [date]
  (str day-stamp-prefix (t/format :iso-local-date date)))

(defn- parse-day-stamp ^LocalDate [s]
  (when (and (string? s) (str/starts-with? s day-stamp-prefix))
    (try
      (t/local-date (str/replace-first s day-stamp-prefix ""))
      (catch Exception _ nil))))

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

(defn- at-least?
  "Whether `actual` is `threshold` or longer.

  `java-time`'s ordering predicates are built on its `Ordered` protocol, which is not extended to `Duration`, so
  comparison goes through `Comparable` instead."
  [^Duration actual ^Duration threshold]
  (>= (.compareTo actual threshold) 0))

(defn- since-last-use
  "How long since `labels` recorded a use, or `nil` if they never did."
  ^Duration [labels today]
  (when-let [stamp (parse-day-stamp (get labels last-used-label))]
    (t/duration (t/time-between stamp today :days) :days)))

(defn random-touch-jitter
  "A random slice of the jitter window, for [[needs-touch?]].

  Drawn here rather than inside [[needs-touch?]] so that stays pure, and per process so that processes crossing the
  interval together do not all write at once."
  ^Duration []
  (t/duration (rand-int (inc (.toDays ^Duration (:touch-jitter retention)))) :days))

(defn needs-touch?
  "Whether `last_used` should be rewritten today."
  [labels today ^Duration jitter]
  (if-let [elapsed (since-last-use labels today)]
    (at-least? elapsed (.plus ^Duration (:touch-interval retention) jitter))
    true))

(defn reapable?
  "Whether a dataset carrying `labels` should be deleted.

  Three ways to qualify: a work dataset whose test is long gone, a gold dataset nothing has used in a fortnight, and
  a dataset still marked `building` well past any plausible load - the residue of a process that died mid-build,
  which nothing will ever finish and [[ready?]] will never accept."
  [labels today]
  (if-let [elapsed (since-last-use labels today)]
    (at-least? elapsed (if (or (ephemeral? labels) (not (ready? labels)))
                         (:work-retention retention)
                         (:gold-retention retention)))
    ;; unlabelled datasets predate this scheme; leave them to a deliberate sweep
    false))
