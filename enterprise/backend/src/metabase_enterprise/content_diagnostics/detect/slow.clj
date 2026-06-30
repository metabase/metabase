(ns metabase-enterprise.content-diagnostics.detect.slow
  "The `slow` Content Diagnostics checker — self-contained and independent of the `stale` checker
  (Phase 1). It flags content whose execution time exceeds a configurable threshold by reading the
  precomputed signals the product already caches (no re-execution — D14):

  - **Card** (leaf): mean `query_execution.running_time` with cache hits excluded — the same aggregate
    the `:average_query_time` hydrate computes — over `slow-card-threshold-seconds`.
  - **Dashboard / Document** (container): a *roll-up* — flagged when they embed ≥1 slow card. The
    culprit card ids are frozen in `details` (`slow_entity_ids`) and hydrated to objects at serve time.
  - **Transform** (leaf): wall-clock duration (`end_time - start_time`) of its latest **succeeded** run
    over `slow-transform-threshold-seconds`.

  Each finding freezes its `threshold_ms` (and, for leaves, the measured `duration_ms`) at scan time
  (D17), so a later threshold change can never contradict an already-emitted verdict.

  Every detector is **set-based** (one grouped/seq query per entity-type) — no per-entity query loop —
  and reads only the app-db, never the warehouse."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.documents.prose-mirror :as prose-mirror]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- cards --------------------------------------------------

(defn- slow-card-id->avg-ms
  "`{card-id → mean running_time (ms, rounded)}` for every **non-archived** card whose mean exceeds
  `threshold-ms`. Reads `query_execution` directly with the same aggregate as the `:average_query_time`
  hydrate — `AVG(running_time)` excluding cache hits — so the verdict reuses the cache the product
  already maintains instead of re-running anything (D14). One grouped query, no per-card loop."
  [threshold-ms]
  (into {}
        (map (juxt :card_id #(Math/round (double (:avg_ms %)))))
        (t2/query {:select   [[:qe.card_id :card_id] [[:avg :qe.running_time] :avg_ms]]
                   :from     [[:query_execution :qe]]
                   :join     [[:report_card :c] [:= :c.id :qe.card_id]]
                   :where    [:and
                              [:not= :qe.running_time nil]
                              [:not= :qe.cache_hit true]
                              [:= :c.archived false]]
                   :group-by [:qe.card_id]
                   :having   [:> [:avg :qe.running_time] threshold-ms]})))

(defn- card-findings
  "Leaf card findings — one per slow card, freezing the measured mean and the threshold."
  [card->avg-ms threshold-ms]
  (for [[card-id avg-ms] card->avg-ms]
    {:entity-type  :card
     :entity-id    card-id
     :finding-type :slow
     :details      {:duration_ms avg-ms :threshold_ms threshold-ms}}))

;;; ----------------------------------------------- container roll-ups ----------------------------------------
;;; A dashboard/document is "slow" when it embeds at least one slow card. We store the culprit ids
;;; (`slow_entity_ids`) loose and let the serve layer hydrate them into objects (D16 / shared serve layer).

(defn- dashboard-findings
  "Container findings for **non-archived** dashboards embedding ≥1 of `slow-card-ids`. `slow_entity_ids`
  is the de-duplicated set of slow cards on the dashboard (a card can appear on several tabs)."
  [slow-card-ids]
  (when (seq slow-card-ids)
    (for [[dash-id rows] (group-by :dashboard_id
                                   (t2/query {:select [[:dc.dashboard_id :dashboard_id] [:dc.card_id :card_id]]
                                              :from   [[:report_dashboardcard :dc]]
                                              :join   [[:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
                                              :where  [:and
                                                       [:= :d.archived false]
                                                       [:in :dc.card_id slow-card-ids]]}))]
      {:entity-type  :dashboard
       :entity-id    dash-id
       :finding-type :slow
       :details      {:slow_entity_ids (vec (distinct (map :card_id rows)))}})))

(defn- document-findings
  "Container findings for **non-archived** prose-mirror documents embedding ≥1 of `slow-card-ids`.
  Card ids are parsed from each document's prose-mirror body (`prose-mirror/card-ids`); only documents
  with the prose-mirror content type are scanned (others would assert-throw and embed no cards anyway)."
  [slow-card-ids]
  (when (seq slow-card-ids)
    (let [slow? (set slow-card-ids)]
      (for [doc      (t2/select [:model/Document :id :document :content_type]
                                :archived false
                                :content_type prose-mirror/prose-mirror-content-type)
            :let     [culprits (filterv slow? (distinct (prose-mirror/card-ids doc)))]
            :when    (seq culprits)]
        {:entity-type  :document
         :entity-id    (:id doc)
         :finding-type :slow
         :details      {:slow_entity_ids culprits}}))))

;;; ------------------------------------------------ transforms -----------------------------------------------

(defn- run-duration-ms
  "Wall-clock milliseconds between two run timestamps."
  [start end]
  (.toMillis ^java.time.Duration (t/duration start end)))

(defn- transform-findings
  "Leaf transform findings — a transform is slow when the wall-clock duration of its **latest succeeded
  run** exceeds `threshold-ms`. Transforms are low-cardinality and have no `archived` tier (D7), so we
  pull succeeded runs newest-first and keep the first per transform (= its latest) via `distinct-by`."
  [threshold-ms]
  (when-let [transform? (not-empty (t2/select-pks-set :model/Transform))]
    (let [latest-run (->> (t2/select [:model/TransformRun :transform_id :start_time :end_time]
                                     :status :succeeded
                                     {:order-by [[:start_time :desc]]})
                          (m/distinct-by :transform_id))]
      (for [{:keys [transform_id start_time end_time]} latest-run
            :when (and (transform? transform_id) start_time end_time)
            :let  [duration-ms (run-duration-ms start_time end_time)]
            :when (> duration-ms threshold-ms)]
        {:entity-type  :transform
         :entity-id    transform_id
         :finding-type :slow
         :details      {:duration_ms duration-ms :threshold_ms threshold-ms}}))))

;;; ------------------------------------------------- checker -------------------------------------------------

(defn slow-checker
  "Instance-wide `slow` finding maps across card (leaf), dashboard/document (container roll-up of slow
  cards), and transform (leaf). The slow-card set is computed once and reused by both roll-ups."
  []
  (let [card-threshold-ms      (* 1000 (cd.settings/slow-card-threshold-seconds))
        transform-threshold-ms (* 1000 (cd.settings/slow-transform-threshold-seconds))
        card->avg-ms           (slow-card-id->avg-ms card-threshold-ms)
        slow-card-ids          (vec (keys card->avg-ms))]
    (concat
     (card-findings card->avg-ms card-threshold-ms)
     (dashboard-findings slow-card-ids)
     (document-findings slow-card-ids)
     (transform-findings transform-threshold-ms))))
