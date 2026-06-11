(ns metabase.collections.curation
  "Canonical definition of \"curated\" content for Metabot's \"verified or curated content\" setting.
  Curated content is verified cards/dashboards, official-collection content, library/published content,
  or authoritative tables.
  [[curated?]] is the predicate, [[curated-honeysql]] its SQL mirror for migrations, and [[curated-ids]]
  applies the predicate to signals read straight from the source tables.
  These three definitions must agree; the consistency test in `curation-test` checks that."
  (:require
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(def library-root-collection-types
  "Collection `type`s (as strings) whose members count as library content."
  (into #{} (map name) collection/library-collection-types))

(defn- as-name
  "Normalize a text signal that may arrive as a keyword or string."
  [v]
  (some-> v name))

(defn- as-bool
  "Coerce a raw boolean signal: only `true`/`1` count as true.
  Guards against DB drivers that surface a boolean column/expression as numeric `0`/`1`, where a plain
  Clojure truthiness check would treat `0` as true."
  [v]
  (or (true? v) (= 1 v)))

(defn curated?
  "Whether the given curation-signal map is curated.
  Reads `:model` `:verified` `:official_collection` `:is_published` `:root_collection_type`
  `:data_layer` `:data_authority`; text signals may be strings or keywords.
  This is the canonical rule: changing it requires a semantic-search index migration to recompute the
  precomputed `curated` column for existing rows (the appdb index self-updates on reindex), and a
  matching update to [[curated-honeysql]]."
  [{:keys [model verified official_collection is_published root_collection_type data_layer data_authority]}]
  ;; No feature gate: a signal can only be set while its feature is present, so the flag is already
  ;; feature-correct and self-heals on the next reindex after any feature change.
  (boolean
   (or (as-bool verified)
       (as-bool official_collection)
       (and (or (as-bool is_published)
                (contains? library-root-collection-types (as-name root_collection_type)))
            ;; published tables count only at the `final` layer; non-table library content has none
            (or (not= (as-name model) "table")
                (= "final" (as-name data_layer))))
       (= "authoritative" (as-name data_authority)))))

(defn curated-honeysql
  "HoneySQL mirror of [[curated?]] for SQL contexts, e.g. backfilling the precomputed `curated` column.
  `col` resolves a signal key to a HoneySQL fragment for the target table; pass a constant for any
  column the table lacks (the semantic index has no `is_published`, so it leans on
  `root_collection_type`)."
  [col]
  [:coalesce
   [:or
    [:is (col :verified) true]
    [:is (col :official_collection) true]
    [:and
     [:or [:is (col :is_published) true]
      [:in (col :root_collection_type) (vec library-root-collection-types)]]
     [:or [:not= (col :model) [:inline "table"]]
      [:= (col :data_layer) [:inline "final"]]]]
    [:= (col :data_authority) [:inline "authoritative"]]]
   false])

;;; --- source-of-truth check (no search index) -------------------------------------------------------
;;;
;;; [[curated-ids]] reads each item's curation signals directly from the source tables and runs them
;;; through [[curated?]], so it has no dependency on the search index being present, fresh, or complete.
;;; The per-signal derivations mirror the search specs (queries/models/card, dashboards/models/dashboard,
;;; warehouse-schema/models/table); the consistency test pins source results to the index's precomputed
;;; `curated` column so the two can't drift. Models are queried via keyword to avoid cross-module deps.

(def ^:private report-card-models
  "Search-model strings backed by `report_card`, moderated as \"card\"."
  #{"card" "dataset" "metric"})

(defn- verified-item-ids
  "Subset of `ids` whose most-recent moderation review for `item-type` is \"verified\"."
  [ids item-type]
  (if (empty? ids)
    #{}
    (t2/select-fn-set :moderated_item_id :model/ModerationReview
                      :moderated_item_id   [:in ids]
                      :moderated_item_type item-type
                      :most_recent         true
                      :status              "verified")))

(defn- collection-info
  "`collection-id → {:authority_level :location :type}` for the given ids."
  [coll-ids]
  (when (seq coll-ids)
    (t2/select-pk->fn #(select-keys % [:authority_level :location :type])
                      :model/Collection :id [:in coll-ids])))

(defn- root-collection-type-of
  [coll-id->info coll-id]
  (let [{:keys [location type]} (get coll-id->info coll-id)]
    (collection/root-collection-type {:collection_id       coll-id
                                      :collection_location location
                                      :collection_type     type})))

(defn- moderatable-curation-signals
  "`[id signal-map]` pairs for collection-housed, moderatable models (report_card-backed and dashboards)."
  [search-model t2-model item-type ids]
  (let [rows     (t2/select [t2-model :id :collection_id] :id [:in ids])
        coll     (collection-info (into #{} (keep :collection_id) rows))
        verified (verified-item-ids ids item-type)]
    (for [{:keys [id collection_id]} rows]
      [id {:model                search-model
           :verified             (contains? verified id)
           ;; authority_level is keyword-transformed on read (collection :type is not — it stays a string,
           ;; which is what curated? and library-root-collection-types expect)
           :official_collection  (= :official (:authority_level (get coll collection_id)))
           :root_collection_type (root-collection-type-of coll collection_id)}])))

(defn- table-curation-signals
  "`[id signal-map]` pairs for tables, whose curation comes from is_published, data_layer, data_authority,
  and (for a table published into a collection) the root collection type."
  [ids]
  (let [rows (t2/select [:model/Table :id :collection_id :is_published :data_layer :data_authority]
                        :id [:in ids])
        coll (collection-info (into #{} (keep :collection_id) rows))]
    (for [{:keys [id collection_id is_published data_layer data_authority]} rows]
      [id {:model                "table"
           :is_published         is_published
           :data_layer           data_layer
           :data_authority       data_authority
           :root_collection_type (root-collection-type-of coll collection_id)}])))

(defn- curation-signals
  "`[id signal-map]` pairs for the given search-model string and ids, read from source-of-truth tables."
  [model ids]
  (cond
    (report-card-models model) (moderatable-curation-signals model :model/Card "card" ids)
    (= "dashboard" model)      (moderatable-curation-signals model :model/Dashboard "dashboard" ids)
    (= "table" model)          (table-curation-signals ids)))

(defn curated-ids
  "Of `model+ids` (`[search-model-string id]` pairs), return the subset that are curated.
  Reads each item's signals from the source tables and applies [[curated?]], with no search-index dependency.
  Recognizes the Metabot recent-view models: card/dataset/metric, dashboard, table."
  [model+ids]
  (into #{}
        (for [[model ids]  (update-vals (group-by first model+ids) #(mapv second %))
              [id signals] (curation-signals model ids)
              :when        (curated? signals)]
          [model id])))
