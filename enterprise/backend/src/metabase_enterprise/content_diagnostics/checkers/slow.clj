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
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
  "`{card-id → median running_time (ms, rounded)}` for every **non-archived** card whose median over its
  last [[lookback-days]] days of non-cache-hit executions exceeds `threshold-ms`. One grouped query, no
  per-card loop."
  [threshold-ms]
  ;; The app dbs share no median/percentile aggregate (H2 has MEDIAN, Postgres percentile_cont, MySQL
  ;; neither), so compute it portably with window functions: rank each card's executions by
  ;; running_time, keep the middle row (odd count) or middle two (even), and AVG them.
  (into {}
        ;; AVG comes back as BigDecimal - round to a Long for the native bigint column.
        (map (juxt :card_id #(Math/round (double (:median_ms %)))))
        (t2/query {:select   [:card_id [[:avg :running_time] :median_ms]]
                   :from     [[{:select [:qe.card_id :qe.running_time
                                         [[:over [[:row_number] {:partition-by :qe.card_id
                                                                 :order-by     [[:qe.running_time :asc]]}]]
                                          :rn]
                                         [[:over [[:count :*] {:partition-by :qe.card_id}]] :cnt]]
                                :from   [[:query_execution :qe]]
                                :join   [[:report_card :c] [:= :c.id :qe.card_id]]
                                :where  [:and
                                         [:not= :qe.running_time nil]
                                         [:not= :qe.cache_hit true]
                                         [:= :c.archived false]
                                         [:>= :qe.started_at (lookback-cutoff)]]}
                               :ranked]]
                   :where    [:and
                              [:>= :rn [:/ :cnt 2.0]]
                              [:<= :rn [:+ [:/ :cnt 2.0] 1]]]
                   :group-by [:card_id]
                   :having   [:> [:avg :running_time] threshold-ms]})))

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
  "`{:dashboard_id … :card_id …}` rows for every way a **non-archived** dashboard runs a card in
  `slow-card-ids` **when it renders**: a dashcard's primary card, and a combined-**series** card (extra
  cards layered onto one dashcard's visualization). Both execute the card's real query on dashboard load.

  We deliberately exclude the third dashboard→card reference dependency tracking counts — a filter's **card
  value-source** (`parameter_card`, the \"From another model or question\" filter option) — because it does
  not reflect this card's slowness: the dropdown values are fetched **on demand** (only when the filter is
  opened), are **cached**, and run a *different, limited distinct-values query* (see
  `parameters.custom-values/values-from-card-query`), not the card's chart query that `duration_ms` measures."
  [slow-card-ids]
  (let [non-archived [:= :d.archived false]]
    (concat
     ;; primary dashcard cards (a card can appear on several tabs — deduped by the caller)
     (t2/query {:select [[:dc.dashboard_id :dashboard_id] [:dc.card_id :card_id]]
                :from   [[:report_dashboardcard :dc]]
                :join   [[:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
                :where  [:and non-archived [:in :dc.card_id slow-card-ids]]})
     ;; combined-series cards (extra cards layered onto one dashcard's visualization)
     (t2/query {:select [[:dc.dashboard_id :dashboard_id] [:s.card_id :card_id]]
                :from   [[:dashboardcard_series :s]]
                :join   [[:report_dashboardcard :dc] [:= :dc.id :s.dashboardcard_id]
                         [:report_dashboard :d]      [:= :d.id :dc.dashboard_id]]
                :where  [:and non-archived [:in :s.card_id slow-card-ids]]}))))

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
  "Container findings for **non-archived** prose-mirror documents embedding ≥1 of `slow-card-ids`.
  Card ids are parsed from each document's prose-mirror body (`prose-mirror/card-ids`); only documents
  with the prose-mirror content type are scanned (others would assert-throw and embed no cards anyway)."
  [card->median-ms slow-card-ids]
  (when (seq slow-card-ids)
    (let [slow? (set slow-card-ids)]
      (for [doc   (t2/select [:model/Document :id :document :content_type]
                             :archived false
                             :content_type prose-mirror/prose-mirror-content-type)
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
  ;; Runs per transform are serialized (`idx_unique_active_transform_run` allows one active run at a
  ;; time), so among a transform's finished runs MAX(start_time) and MAX(end_time) belong to the same
  ;; (latest) row - one grouped query, one row per transform, no fetch of the full run history.
  (for [{:keys [transform_id start_time end_time]}
        (t2/query {:select   [:transform_id
                              [[:max :start_time] :start_time]
                              [[:max :end_time] :end_time]]
                   :from     [:transform_run]
                   :where    [:and
                              [:in :status ["succeeded" "failed" "timeout"]]
                              [:>= :start_time (lookback-cutoff)]]
                   :group-by [:transform_id]})
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
