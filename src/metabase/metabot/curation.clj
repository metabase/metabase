(ns metabase.metabot.curation
  "Source-of-truth curation check for Metabot's recent-view context.
  Reads each item's curation signals straight from the source tables and applies the canonical
  [[metabase.collections.curation/curated?]] predicate, so it has no dependency on the search index being
  present, fresh, or complete, and can't drift from the rule.
  Lives in metabot rather than collections.curation because it reads cards/dashboards/tables/reviews, which
  are higher-level models a foundational module shouldn't reference; a consistency test pins it to the
  index's precomputed `curated` column."
  (:require
   [metabase.collections.curation :as curation]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

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
  Reads each item's signals from the source tables and applies [[curation/curated?]], with no search-index
  dependency. Recognizes the Metabot recent-view models: card/dataset/metric, dashboard, table."
  [model+ids]
  (into #{}
        (for [[model ids]  (update-vals (group-by first model+ids) #(mapv second %))
              [id signals] (curation-signals model ids)
              :when        (curation/curated? signals)]
          [model id])))
