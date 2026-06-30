(ns metabase-enterprise.content-diagnostics.detect
  "Content Diagnostics scan pipeline. A scan runs every registered *checker* instance-wide, writes one
  `scan_id` batch of findings, and emits o11y signals (duration + outcome + magnitude).

  The `stale` checker reuses the EE stale module's candidate query via its instance-wide
  (`:collection-ids :all`) arity — one source of truth for the staleness rule, no copy."
  (:require
   [clojure.set :as set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   ;; sanctioned export: find-candidates is the stale module's public staleness-rule entry point
   ;; (see enterprise/stale :api in .clj-kondo/config/modules/config.edn).
   [metabase-enterprise.stale.impl :as stale.impl]
   [metabase.analytics-interface.core :as analytics]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def entity-type->model
  "Content Diagnostics entity-types → their Toucan models. Single source of truth: the API's display
  hydration and the scan's candidate→finding mapping both derive from this (inverse below)."
  {:card      :model/Card
   :dashboard :model/Dashboard})

(def ^:private model->entity-type
  "Inverse of [[entity-type->model]] — `find-candidates` returns `:model` keywords like `:model/Card`."
  (set/map-invert entity-type->model))

;;; ---------------------------------------------- checkers ----------------------------------------------
;;; A checker is a 0-arg fn returning a seq of finding maps:
;;;   {:entity-type <kw> :entity-id <int> :finding-type <kw> :details <map>}

(defn stale-checker
  "Instance-wide stale Card/Dashboard candidates as finding maps (reuses the EE stale module)."
  []
  (let [threshold (cd.settings/content-diagnostics-stale-threshold-days)
        cutoff    (t/minus (t/local-date) (t/days threshold))
        {:keys [rows]} (stale.impl/find-candidates
                        {:collection-ids :all
                         :cutoff-date    cutoff
                         :limit          nil
                         :offset         nil
                         :sort-column    :name
                         :sort-direction :asc})]
    (for [{:keys [id model last_used_at created_at creator_id] entity-name :name} rows
          :let  [et (model->entity-type model)]
          :when et]
      {:entity-type       et
       :entity-id         id
       :finding-type      :stale
       ;; freeze the scan-time activity anchor (D17): `last_used_at` for cards, `last_viewed_at` for
       ;; dashboards (the stale query aliases both to `last_used_at`). `nil` ⇒ never used/ran. Top-level
       ;; column (not in `details`) so it's served flat and SQL-filterable by the threshold-days param.
       :last-active-at    last_used_at
       ;; denormalized entity attributes → native ORDER BY columns (name / created_at / creator). Display
       ;; still hydrates the live name/creator; created_at is immutable so the frozen copy equals live.
       :entity-name       entity-name
       :entity-created-at created_at
       :entity-creator-id creator_id
       :details           {:threshold_days threshold}})))

(def checkers
  "Ordered checker registry. Each entry **declares** the finding-types it owns and a 0-arg `:run` fn
  returning finding maps. Declaring the types (rather than inferring them from a scan's output) is what
  lets post-scan invalidation know its supersession scope even when a scan emits **zero** rows — i.e. an
  all-clean scan still resolves the previous scan's findings."
  [{:finding-types #{:stale} :run stale-checker}])

(defn covered-finding-types
  "The set of finding-types the registered checkers own — the supersession scope for post-scan invalidation."
  []
  (into #{} (mapcat :finding-types) checkers))

(defn detect
  "Run every checker instance-wide and return one realized, de-duplicated vector of finding maps.
  `m/distinct-by` is a memoized seen-set transducer: it remembers each (entity-type, entity-id,
  finding-type) tuple and silently drops the second occurrence as it streams through. A checker — or
  the stale query's one-to-many joins (e.g. a card with several `pulse_card` rows) — can surface the
  same finding twice; this is the app-layer guarantee that no intra-scan duplicate ever reaches the DB."
  []
  (into []
        (m/distinct-by (juxt :entity-type :entity-id :finding-type))
        (mapcat (fn [checker] ((:run checker))) checkers)))

;;; ----------------------------------------------- scan ------------------------------------------------

(defn- count-scannable
  "Size of the candidate universe the checkers swept (non-archived Cards + Dashboards) — the denominator
  for the findings/entities topline."
  []
  (+ (t2/count :model/Card :archived false)
     (t2/count :model/Dashboard :archived false)))

(defn- scope-collection-id-lookup
  "Batched `{[entity-type entity-id] → collection_id}` for the findings' entities — **one** query per
  entity-type (over just the flagged entities, F ≪ N). Entity types whose model has no `collection_id`
  contribute nothing; an entity at the root maps to nil."
  [findings]
  (into {}
        (for [[etype fs] (group-by :entity-type findings)
              :let       [model (entity-type->model etype)]
              :when      model
              :let       [id->coll (t2/select-pk->fn :collection_id [model :id :collection_id]
                                                     :id [:in (set (map :entity-id fs))])]
              {:keys [entity-id]} fs]
          [[etype entity-id] (get id->coll entity-id)])))

(defn- attach-scope-collection-ids
  "Stamp each finding with `:scope-collection-id` — the collection the entity lived in at scan time.
  Forward-compatible substrate for serve-time collection scoping; cheap (see [[scope-collection-id-lookup]])."
  [findings]
  (let [lookup (scope-collection-id-lookup findings)]
    (mapv #(assoc % :scope-collection-id (get lookup [(:entity-type %) (:entity-id %)])) findings)))

(def ^:private insert-batch-size
  "Rows per INSERT. Postgres caps a prepared statement at 65,535 bind parameters; at ~6 columns/row a
  single all-rows insert overflows past ~10k findings (observed on the stats DB). 1000 keeps us well
  under (mirrors `mark-stale-batch-size` in the deps module)."
  1000)

(defn- insert-findings!
  "Persist findings as independent **chunk-committed** transactions — each chunk is its own transaction,
  so completed chunks are durable even if a later chunk fails (no single all-rows transaction held open
  for the whole scan). Chunking also keeps each statement under the bind-parameter cap. This is safe to
  serve mid-write because the serve layer reads latest-per-entity (`api/active-findings`), so a partial
  batch degrades gracefully rather than blanking out un-written entities."
  [scan-id findings]
  (doseq [chunk (partition-all insert-batch-size findings)]
    (t2/with-transaction [_conn]
      (t2/insert! :model/ContentDiagnosticsFinding
                  (for [{:keys [entity-type entity-id finding-type details scope-collection-id last-active-at
                                entity-name entity-created-at entity-creator-id]} chunk]
                    {:scan_id             scan-id
                     :entity_type         entity-type
                     :entity_id           entity-id
                     :finding_type        finding-type
                     :scope_collection_id scope-collection-id
                     :last_active_at      last-active-at
                     :entity_name         entity-name
                     :entity_created_at   entity-created-at
                     :entity_creator_id   entity-creator-id
                     :details             details})))))

(defn scan!
  "Run a full scan synchronously: every checker → one `scan_id` batch → persisted. Emits scan o11y
  (duration histogram, outcome counter, findings/entities gauges). Returns
  `{:scan_id :finding_count :entities_scanned :duration_ms}`."
  []
  (let [timer (u/start-timer)]
    (try
      (let [scan-id  (str (random-uuid))
            findings (attach-scope-collection-ids (detect))
            entities (count-scannable)]
        (insert-findings! scan-id findings)
        ;; write-side resolution: supersede prior-scan findings the new batch didn't re-emit. Runs after
        ;; the batch commits and only on success — a failed scan leaves prior findings served (last-known).
        (finding/invalidate-superseded! scan-id (covered-finding-types))
        (let [duration (u/since-ms timer)]
          (analytics/observe! :metabase-content-diagnostics/scan-duration-ms {:status "ok"} duration)
          (analytics/inc!     :metabase-content-diagnostics/scans            {:status "ok"})
          (analytics/set-gauge! :metabase-content-diagnostics/scan-findings (count findings))
          (analytics/set-gauge! :metabase-content-diagnostics/scan-entities entities)
          (log/infof "Content Diagnostics scan %s: %d findings over %d entities in %.0f ms"
                     scan-id (count findings) entities (double duration))
          {:scan_id          scan-id
           :finding_count    (count findings)
           :entities_scanned entities
           :duration_ms      (long duration)}))
      (catch Throwable t
        (analytics/observe! :metabase-content-diagnostics/scan-duration-ms {:status "error"} (u/since-ms timer))
        (analytics/inc!     :metabase-content-diagnostics/scans            {:status "error"})
        (log/error t "Content Diagnostics scan failed")
        (throw t)))))
