(ns metabase-enterprise.content-diagnostics.scan
  "Content Diagnostics scan pipeline. A scan runs every registered *checker* instance-wide and writes
  one `scan_id` batch of findings. Orchestration only - the per-finding-type detection logic lives in
  `checkers/*`, the shared entity-type mapping + denormalization helper in `common`."
  (:require
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.checkers.duplicated :as duplicated]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.crowded :as imbalanced.crowded]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.empty :as imbalanced.empty]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.sparse :as imbalanced.sparse]
   [metabase-enterprise.content-diagnostics.checkers.slow :as slow]
   [metabase-enterprise.content-diagnostics.checkers.stale :as stale]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- checkers ----------------------------------------------
;;; A checker is a 0-arg fn returning a seq of finding maps:
;;;   {:entity-type <kw> :entity-id <int> :finding-type <kw> :details <map>}

(def checkers
  "Ordered checker registry. Each entry **declares** the finding-types it owns and a 0-arg `:run` fn
  returning finding maps. Declaring the types (rather than inferring them from a scan's output) is what
  lets post-scan invalidation know its supersession scope even when a scan emits **zero** rows - i.e. an
  all-clean scan still resolves the previous scan's findings."
  [{:finding-types #{:stale}      :run stale/checker}
   {:finding-types #{:slow}       :run slow/checker}
   {:finding-types #{:duplicated} :run duplicated/checker}
   ;; the imbalanced family: three independent checkers (one namespace each under checkers/imbalanced/)
   ;; with no cross-type precedence, so one entity can carry several of these finding types at once;
   ;; each declared type scopes its own supersession
   {:finding-types #{:empty}      :run imbalanced.empty/checker}
   {:finding-types #{:sparse}     :run imbalanced.sparse/checker}
   {:finding-types #{:crowded}    :run imbalanced.crowded/checker}])

(defn covered-finding-types
  "The set of finding-types the registered checkers own - the supersession scope for post-scan invalidation."
  []
  (into #{} (mapcat :finding-types) checkers))

(defn detect
  "Run every checker instance-wide and return a de-duplicated vector of finding maps. De-dupes on
  (entity-type, entity-id, finding-type): a checker or the stale query's one-to-many joins can emit
  the same finding twice, and no intra-scan duplicate may reach the DB. Also drops findings on
  document-owned cards, so every checker gets that rule for free."
  []
  (common/remove-document-internal-card-findings
   (into []
         (m/distinct-by (juxt :entity-type :entity-id :finding-type))
         (mapcat (fn [checker] ((:run checker))) checkers))))

;;; ----------------------------------------------- scan ------------------------------------------------

(defn- scope-collection-id-lookup
  "Batched `{[entity-type entity-id] → collection_id}` for the findings' entities - **one** query per
  entity-type (over just the flagged entities, F ≪ N). Entity types whose model has no `collection_id`
  contribute nothing; an entity at the root maps to nil. A `:collection` subject has no `collection_id`
  column - \"where it lived when flagged\" is its **parent**, parsed from `location` (nil at root)."
  [findings]
  (into {}
        (for [[entity-type findings-for-type] (group-by :entity-type findings)
              :let       [model (common/entity-type->model entity-type)]
              :when      model
              :let       [ids      (set (map :entity-id findings-for-type))
                          id->coll (if (= entity-type :collection)
                                     (t2/select-pk->fn (comp collection/location-path->parent-id :location)
                                                       [:model/Collection :id :location]
                                                       :id [:in ids])
                                     (t2/select-pk->fn :collection_id [model :id :collection_id]
                                                       :id [:in ids]))]
              {:keys [entity-id]} findings-for-type]
          [[entity-type entity-id] (get id->coll entity-id)])))

(defn- attach-scope-collection-ids
  "Stamp each finding with `:scope-collection-id` - the collection the entity lived in at scan time."
  [findings]
  (let [lookup (scope-collection-id-lookup findings)]
    (mapv #(assoc % :scope-collection-id (get lookup [(:entity-type %) (:entity-id %)])) findings)))

(defn- attach-collection-names
  "Stamp each finding with `:entity-collection-name` - the scan-time name of its `:scope-collection-id`
  collection. Root-resident entities store their root's label (\"Our analytics\"; \"Transforms\" for a
  transform) so the sort places them under the label the UI shows. The label is realized in the site
  locale - no user locale is bound in the scan job."
  [findings]
  (let [ids        (into #{} (keep :scope-collection-id) findings)
        id->name   (when (seq ids)
                     (t2/select-pk->fn :name [:model/Collection :id :name] :id [:in ids]))
        ;; root-resident collection subjects sit under their own tree's root (GDGT-2921 admits
        ;; transforms/tenant-namespace collections as subjects), so look their namespace up
        root-colls (into #{}
                         (comp (filter #(and (= (:entity-type %) :collection)
                                             (nil? (:scope-collection-id %))))
                               (map :entity-id))
                         findings)
        id->ns     (when (seq root-colls)
                     (t2/select-pk->fn :namespace [:model/Collection :id :namespace]
                                       :id [:in root-colls]))
        ;; str realizes the label NOW, in the job's (site) locale
        root-label (memoize (fn [collection-namespace]
                              (str (:name (collection/root-collection-with-ui-details
                                           collection-namespace)))))]
    (mapv (fn [{:keys [scope-collection-id entity-type entity-id] :as finding}]
            (assoc finding :entity-collection-name
                   (if scope-collection-id
                     (get id->name scope-collection-id)
                     (root-label (common/entity-root-namespace entity-type (get id->ns entity-id))))))
          findings)))

(def ^:private insert-batch-size
  "Rows per INSERT. Postgres caps a prepared statement at 65,535 bind parameters; at ~17 columns/row a
  single all-rows insert overflows past ~3.8k findings. 1000 keeps us well under (mirrors
  `mark-stale-batch-size` in the deps module)."
  1000)

(defn- insert-findings!
  "Persist findings as independent **chunk-committed** transactions - each chunk is its own transaction,
  so completed chunks are durable even if a later chunk fails (no single all-rows transaction held open
  for the whole scan). Chunking also keeps each statement under the bind-parameter cap."
  [scan-id findings]
  (doseq [chunk (partition-all insert-batch-size findings)]
    (t2/with-transaction [_conn]
      (t2/insert! :model/ContentDiagnosticsFinding
                  (for [{:keys [entity-type entity-id finding-type details scope-collection-id
                                last-active-at duration-ms content-count duplicate-count
                                entity-name entity-created-at entity-creator-id entity-creator-name
                                card-type entity-collection-name entity-kind]}
                        chunk]
                    {:scan_id             scan-id
                     :entity_type         entity-type
                     :entity_id           entity-id
                     :finding_type        finding-type
                     :scope_collection_id scope-collection-id
                     :last_active_at      last-active-at
                     :duration_ms         duration-ms
                     :content_count       content-count
                     :duplicate_count     duplicate-count
                     :entity_name         entity-name
                     :entity_created_at   entity-created-at
                     :entity_creator_id   entity-creator-id
                     :entity_creator_name entity-creator-name
                     :card_type           card-type
                     :entity_collection_name entity-collection-name
                     :entity_kind         entity-kind
                     :details             details})))))

(defn scan!
  "Run a full scan synchronously: every checker → one `scan_id` batch → persisted. The persisted findings
  are the real result; returns the scan's topline `{:scan_id :finding_count :duration_ms}` for callers
  that report it (the demo `POST /scan`)."
  []
  (let [timer    (u/start-timer)
        scan-id  (str (random-uuid))
        findings (attach-collection-names (attach-scope-collection-ids (detect)))]
    (insert-findings! scan-id findings)
    ;; write-side resolution: supersede prior-scan findings the new batch didn't re-emit. Only runs on
    ;; success - a failed scan never invalidates prior findings, though already-committed chunks of the
    ;; failed batch stay active alongside them.
    (finding/invalidate-superseded! scan-id (covered-finding-types))
    (let [duration-ms (u/since-ms timer)]
      (log/infof "Content Diagnostics scan %s: %d findings in %.0f ms" scan-id (count findings) duration-ms)
      {:scan_id       scan-id
       :finding_count (count findings)
       ;; coerce to a primitive double so Math/round resolves without reflection (u/since-ms is un-hinted)
       :duration_ms   (Math/round (double duration-ms))})))

(defenterprise run-content-diagnostics-scan!
  "EE implementation: runs a full scan synchronously and returns its topline. Only for the testing API —
  see [[metabase.testing-api.api]]."
  :feature :none
  []
  (scan!))
