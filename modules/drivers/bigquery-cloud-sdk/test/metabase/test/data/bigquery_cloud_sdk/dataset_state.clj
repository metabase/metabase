(ns metabase.test.data.bigquery-cloud-sdk.dataset-state
  "Lifecycle state of a BigQuery test dataset, as recorded in its dataset labels, and the retention policy applied to
  it.

  Two tiers of dataset live in the test project:

  - *gold*: content-addressed, built once, never written to afterwards, shared by every branch that derives the same
    hash. Marked `state=ready` only once every table is loaded.
  - *work*: created by a single test, written to, and dropped when it finishes. Marked `ephemeral=true` and given a
    table expiration so an abandoned one costs nothing.

  `state` is what makes publishing atomic. A dataset exists from the moment loading starts, so its existence says
  nothing about whether its tables have rows; only the flip to `ready` does, and that is a single metadata write.

  Every other label is written once, at creation, and never changed. In particular retention is keyed on when a
  dataset was *created*, not when it was last used: measurement put a full rebuild of every dataset at roughly 8% of
  one CI run, which is far too cheap to justify maintaining a last-used timestamp. Not maintaining one removes the
  recurring metadata write, the debounce and jitter needed to make that write safe, and the failure mode where a
  touch silently fails and a dataset still in use is reaped out from under a running job.

  Nothing here decides that a dataset is unused. [[stale?]] says a gold dataset is old enough to rebuild, and
  [[tx/create-db!]] rebuilds it in place, which resets `created`. A dataset that keeps being used therefore keeps
  being young, so by the time [[reapable?]] fires at twice the lifetime, nothing has wanted it for a full lifetime.
  That is what makes deletion safe without ever recording a use.

  Depends on nothing from Metabase, so a scheduled reaper can load it without starting the app."
  (:require
   [clojure.string :as str]
   [java-time.api :as t])
  (:import
   (java.time Duration Instant LocalDateTime ZoneOffset)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(def retention
  "How long each kind of dataset lives.

  `gold-lifetime` is when a shared dataset is rebuilt, `gold-reap` when one nobody rebuilt is deleted. `gold-reap`
  must stay comfortably above `gold-lifetime` - that gap is the entire evidence that a reaped dataset was unused, and
  it is also the window in which a rebuild may race a job still reading the old dataset. Rebuilding costs seconds,
  so prefer widening the gap over narrowing it.

  `work-lifetime` has to outlast the longest single test, since it is what stops the reaper deleting a work dataset
  from under the test that made it."
  {:gold-lifetime (t/duration 30 :days)
   :gold-reap     (t/duration 60 :days)
   :work-lifetime (t/duration 1 :days)})

(def ^:private state-label "state")
(def ^:private ephemeral-label "ephemeral")
(def ^:private created-label "created")

(def ^:private stamp-prefix
  "Label values may not begin with a digit, so a timestamp needs a leading letter to be legal."
  "d")

(def ^:private ^DateTimeFormatter stamp-formatter
  "Basic-format ISO 8601 in UTC, lowercased.

  Label values admit only lowercase alphanumerics, dashes and underscores, so the `:` of an ordinary ISO timestamp
  is out and the `T` has to be lowercase.

  Seconds rather than days because `work-lifetime` is a single day: at day granularity a work dataset created at
  23:59 would be a day old one minute later, and the reaper would delete it out from under the test that made it."
  (DateTimeFormatter/ofPattern "yyyyMMdd't'HHmmss"))

(defn stamp
  "`instant` as a dataset label value."
  [^Instant instant]
  (str stamp-prefix (.format stamp-formatter (LocalDateTime/ofInstant instant ZoneOffset/UTC))))

(defn- parse-stamp ^Instant [s]
  (when (and (string? s) (str/starts-with? s stamp-prefix))
    (try
      (.toInstant (.atOffset (LocalDateTime/parse (str/replace-first s stamp-prefix "") stamp-formatter)
                             ZoneOffset/UTC))
      (catch Exception _ nil))))

(defn building-labels
  "Labels a dataset is created with, before any table exists in it. Every value here is final except `state`."
  [{:keys [ephemeral? now]}]
  {state-label     "building"
   ephemeral-label (if ephemeral? "true" "false")
   created-label   (stamp now)})

(defn ready-labels
  "Labels that publish a dataset. Written as a complete set rather than a delta, so it does not matter whether
  BigQuery merges or replaces labels on update. `created` must be the value the dataset was built with, not now, or
  publishing would silently reset its age."
  [{:keys [ephemeral? created]}]
  (assoc (building-labels {:ephemeral? ephemeral?, :now created})
         state-label "ready"))

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

(defn created
  "When the dataset was built, or `nil` if it carries no readable `created` label."
  ^Instant [labels]
  (parse-stamp (get labels created-label)))

(defn- older-than?
  "Whether `labels` were written more than `limit` ago. False when they carry no readable `created`: an age that
  cannot be measured must not be treated as old, or an unrecognised dataset would be rebuilt or reaped on sight."
  [labels ^Instant now ^Duration limit]
  (if-let [^Instant born (created labels)]
    ;; `java-time`'s ordering predicates are built on its `Ordered` protocol, which is not extended to `Duration`,
    ;; so comparison goes through `Comparable` instead.
    (>= (.compareTo (Duration/between born now) limit) 0)
    false))

(defn stale?
  "Whether a published gold dataset is old enough to rebuild.

  Only meaningful for gold: a work dataset is dropped by the test that made it and never lives long enough to age."
  [labels now]
  (older-than? labels now (:gold-lifetime retention)))

(defn reapable?
  "Whether a dataset carrying `labels` should be deleted.

  Three ways to qualify: a work dataset whose test is long gone, a dataset still marked `building` well past any
  plausible load - the residue of a process that died mid-build, which nothing will ever finish and [[ready?]] will
  never accept - and a gold dataset that has gone a full lifetime past the point where anything using it would have
  rebuilt it."
  [labels now]
  (older-than? labels now (if (or (ephemeral? labels) (not (ready? labels)))
                            (:work-lifetime retention)
                            (:gold-reap retention))))
