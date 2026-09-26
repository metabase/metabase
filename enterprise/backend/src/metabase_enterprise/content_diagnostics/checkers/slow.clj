(ns metabase-enterprise.content-diagnostics.checkers.slow
  "The `slow` Content Diagnostics checker - flags content whose execution time exceeds a configurable
  threshold by reading the precomputed signals the product already caches (no re-execution):

  - **Card** (leaf): median `query_execution.running_time` with cache hits excluded, over
    `slow-card-threshold-seconds`.
  - **Dashboard / Document** (container): a *roll-up* - flagged when they embed ≥1 slow card. The
    culprit card ids are frozen in `details` (`slow_entity_ids`) and hydrated to objects at read time;
    the container's own `:duration-ms` is the slowest culprit's median, a representative magnitude so
    containers sort/filter by duration alongside leaves.
  - **Transform** (leaf): wall-clock duration (`end_time - start_time`) of its latest **finished** run
    (succeeded/failed/timeout - not canceled) over `slow-transform-threshold-seconds`.

  Leaves freeze their `threshold_ms` in `details` at scan time; every finding carries its measured
  magnitude in the top-level `:duration-ms` (→ the native `duration_ms` column). Every detector is
  **set-based** (a fixed handful of grouped queries, no per-entity loops), reads only the app-db, never the warehouse,
  and only considers activity within the last [[lookback-days]] days.
  The denormalized display attrs are stamped by `common/attach-entity-attrs`; `:last-active-at` is left
  unset (the column stays NULL on slow findings)."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private lookback-days
  "Only activity within this window counts toward slowness - executions or runs older than this say
  nothing about how the content performs today."
  30)

(defn- lookback-cutoff
  "The earliest activity timestamp the current scan considers."
  []
  (t/minus (t/offset-date-time) (t/days lookback-days)))

;;; -------------------------------------------------- cards --------------------------------------------------

(defn- slow-card-id->median-ms
  "`{card-id → median running_time (ms, rounded)}` for every **non-archived** card in an eligible
  container whose median over its last [[lookback-days]] days of non-cache-hit executions exceeds
  `threshold-ms`. One grouped query, no per-card loop."
  [threshold-ms]
  (into {}
        ;; AVG comes back as BigDecimal - round to a Long for the native bigint column.
        (map (juxt :card_id #(Math/round (double (:median_ms %)))))
        (cd.db/card-run-medians threshold-ms
                                (lookback-cutoff)
                                (common/eligible-container-clause :c.collection_id))))

(defn- card-findings
  "Leaf card findings - one per slow card, carrying the measured median (`:duration-ms`) and freezing the
  threshold."
  [card->median-ms threshold-ms]
  (for [[card-id median-ms] card->median-ms]
    {:entity-type  :card
     :entity-id    card-id
     :finding-type :slow
     :duration-ms  median-ms
     :details      {:threshold_ms threshold-ms}}))

;;; ----------------------------------------------- container roll-ups ----------------------------------------
;;; A dashboard/document is "slow" when it embeds at least one slow card. We store the culprit ids
;;; (`slow_entity_ids`) loose and let the read layer hydrate them into objects; the container's own
;;; `:duration-ms` is the slowest culprit's median, so it sorts/filters by duration like a leaf.

(defn- representative-duration-ms
  "A container's stand-in magnitude - the slowest culprit card's median."
  [card->median-ms culprit-ids]
  (apply max (map card->median-ms culprit-ids)))

(defn- container-finding
  "The shared roll-up finding for a container (dashboard/document): its culprit slow cards frozen in
  `slow_entity_ids`, and its own `:duration-ms` set to the slowest culprit's median so it sorts/filters
  by duration like a leaf. The two containers differ only in how they derive `culprit-ids`."
  [entity-type entity-id card->median-ms culprit-ids]
  {:entity-type  entity-type
   :entity-id    entity-id
   :finding-type :slow
   :duration-ms  (representative-duration-ms card->median-ms culprit-ids)
   :details      {:slow_entity_ids culprit-ids}})

(defn- dashboard-culprit-pairs
  "`{:dashboard_id … :card_id …}` rows for every way a **non-archived** dashboard in an eligible
  container runs a card in `slow-card-ids` **when it renders**: a dashcard's primary card, and a
  combined-**series** card (extra
  cards layered onto one dashcard's visualization). Both execute the card's real query on dashboard load.

  We deliberately exclude the third dashboard→card reference dependency tracking counts — a filter's **card
  value-source** (`parameter_card`, the \"From another model or question\" filter option) — because it does
  not reflect this card's slowness: the dropdown values are fetched **on demand** (only when the filter is
  opened), are **cached**, and run a *different, limited distinct-values query* (see
  `parameters.custom-values/values-from-card-query`), not the card's chart query that `duration_ms` measures."
  [slow-card-ids]
  (let [eligible [:and
                  [:= :d.archived false]
                  ;; the container clause is re-applied to the dashboard itself - a slow (eligible) card
                  ;; can be embedded by a dashboard living in an ineligible container
                  (common/eligible-container-clause :d.collection_id)]]
    (concat
     ;; primary dashcard cards (a card can appear on several tabs — deduped by the caller)
     (cd.db/dashboard-primary-card-pairs eligible slow-card-ids)
     ;; combined-series cards (extra cards layered onto one dashcard's visualization)
     (cd.db/dashboard-series-card-pairs eligible slow-card-ids))))

(defn- dashboard-findings
  "Container findings for **non-archived** dashboards that render ≥1 of `slow-card-ids`. `slow_entity_ids`
  is the de-duplicated set of slow cards the dashboard runs on load — primary or series (see
  `dashboard-culprit-pairs`)."
  [card->median-ms slow-card-ids]
  (when (seq slow-card-ids)
    (for [[dash-id rows] (group-by :dashboard_id (dashboard-culprit-pairs slow-card-ids))
          :let [culprit-ids (vec (distinct (map :card_id rows)))]]
      (container-finding :dashboard dash-id card->median-ms culprit-ids))))

(defn- document-findings
  "Container findings for **non-archived** prose-mirror documents in eligible containers embedding ≥1
  of `slow-card-ids`.
  Card ids are parsed from each document's prose-mirror body (`prose-mirror/card-ids`); only documents
  with the prose-mirror content type are scanned (others would assert-throw and embed no cards anyway)."
  [card->median-ms slow-card-ids]
  (when (seq slow-card-ids)
    (let [slow? (set slow-card-ids)]
      ;; the container clause is re-applied to the document itself - a slow (eligible) card can be
      ;; embedded by a document living in an ineligible container
      (for [doc   (cd.db/documents-of-content-type prose-mirror/prose-mirror-content-type
                                                   (common/eligible-container-clause :collection_id))
            :let  [culprits (filterv slow? (distinct (prose-mirror/card-ids doc)))]
            :when (seq culprits)]
        (container-finding :document (:id doc) card->median-ms culprits)))))

;;; ------------------------------------------------ transforms -----------------------------------------------

(defn- run-duration-ms
  "Wall-clock milliseconds between two run timestamps."
  [start end]
  (.toMillis ^java.time.Duration (t/duration start end)))

(defn- transform-findings
  "Leaf transform findings - a transform is slow when the wall-clock duration of its latest **finished**
  run (succeeded, failed, or timed out) exceeds `threshold-ms`. Canceled runs don't count: their
  duration measures when someone hit cancel, not the transform. Only runs started within the last
  [[lookback-days]] days are considered."
  [threshold-ms]
  (for [{:keys [transform_id start_time end_time]}
        (cd.db/finished-transform-run-spans (lookback-cutoff))
        :when (and start_time end_time)
        :let  [duration-ms (run-duration-ms start_time end_time)]
        :when (> duration-ms threshold-ms)]
    {:entity-type  :transform
     :entity-id    transform_id
     :finding-type :slow
     :duration-ms  duration-ms
     :details      {:threshold_ms threshold-ms}}))

;;; ------------------------------------------------- checker -------------------------------------------------

(defn checker
  "Instance-wide `slow` finding maps across card (leaf), dashboard/document (container roll-up of slow
  cards), and transform (leaf). The slow-card set is computed once and reused by both roll-ups; the
  denormalized display attrs are stamped by `common/attach-entity-attrs`."
  []
  (let [card-threshold-ms      (u/seconds->ms (cd.settings/content-diagnostics-slow-card-threshold-seconds))
        transform-threshold-ms (u/seconds->ms (cd.settings/content-diagnostics-slow-transform-threshold-seconds))
        card->median-ms        (slow-card-id->median-ms card-threshold-ms)
        slow-card-ids          (vec (keys card->median-ms))]
    (common/attach-entity-attrs
     (concat
      (card-findings card->median-ms card-threshold-ms)
      (dashboard-findings card->median-ms slow-card-ids)
      (document-findings card->median-ms slow-card-ids)
      (transform-findings transform-threshold-ms)))))
