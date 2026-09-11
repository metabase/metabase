(ns metabase.metabot.curation
  "Source-of-truth curation checks for Metabot: recent-view context, and the tools that must stay within curated
  content when a Metabot has `use_verified_content` on (see [[curated-content-only?]]).
  Reads each item's curation signals straight from the source tables and applies the canonical
  [[metabase.collections.curation/curated?]] predicate, so it has no dependency on the search index being
  present, fresh, or complete, and can't drift from the rule.
  Lives in metabot rather than collections.curation because it reads cards/dashboards/tables/reviews, which
  are higher-level models a foundational module shouldn't reference; a consistency test pins it to the
  index's precomputed `curated` column."
  (:require
   [metabase.collections.curation :as curation]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.db :as metabot.db]))

(def ^:private report-card-models
  "Search-model strings backed by `report_card`, moderated as \"card\"."
  #{"card" "dataset" "metric"})

(defn- verified-item-ids
  "Subset of `ids` whose most-recent moderation review for `item-type` is \"verified\"."
  [ids item-type]
  (if (empty? ids)
    #{}
    (metabot.db/verified-item-ids ids item-type)))

(defn- collection-info
  "`collection-id → {:authority_level :location :type}` for the given ids."
  [coll-ids]
  (when (seq coll-ids)
    (update-vals (metabot.db/collection-curation-info-by-id coll-ids)
                 #(select-keys % [:authority_level :location :type]))))

(defn- root-collection-type-of
  [coll-id->info coll-id]
  (let [{:keys [location type]} (get coll-id->info coll-id)]
    (collection/root-collection-type {:collection_id       coll-id
                                      :collection_location location
                                      :collection_type     type})))

(defn- moderatable-curation-signals
  "`[id signal-map]` pairs for collection-housed, moderatable models (report_card-backed and dashboards)."
  [search-model t2-model item-type ids]
  (let [rows     (case t2-model
                   :model/Card      (metabot.db/card-collection-ids ids)
                   :model/Dashboard (metabot.db/dashboard-collection-ids ids))
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
  "`[id signal-map]` pairs for tables, whose curation comes from is_published, data_layer, and data_authority.
  root_collection_type is intentionally omitted: the table search spec joins the collection only for
  published tables, and for a published table is_published already decides curation, so the root type never
  changes a table's verdict. Omitting it avoids re-deriving from a possibly-stale collection_id, and lets
  curated? coerce is_published consistently (only true/1 count)."
  [ids]
  (for [{:keys [id is_published data_layer data_authority]}
        (metabot.db/table-curation-rows ids)]
    [id {:model          "table"
         :is_published   is_published
         :data_layer     data_layer
         :data_authority data_authority}]))

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

(defn- metabot-row
  "The Metabot row for `metabot-id` — a key of [[metabot.config/metabot-config]] or a Metabot entity id — or nil."
  [metabot-id]
  (when metabot-id
    (metabot.db/metabot-by-entity-id (get-in metabot.config/metabot-config [metabot-id :entity-id] metabot-id))))

(def ^:private curation-exempt-profiles
  "Profiles whose tools aren't restricted by `use_verified_content`. The nlq profile discovers data through the curated
  library tool, which carries its own scoping; `nlq-fallback` serves the same profile."
  #{"nlq" "nlq-fallback"})

(defn curated-content-only?
  "Whether a Metabot tool running for `metabot-id` under `profile-id` may only reach curated content, i.e. the Metabot
  has `use_verified_content` on. Extends the `:curated` filter Metabot search applies to the tools that read or query
  entities directly, so uncurated tables and cards can't be reached around search (BOT-1649)."
  [metabot-id profile-id]
  (boolean
   (and (not (curation-exempt-profiles (some-> profile-id name)))
        (:use_verified_content (metabot-row metabot-id)))))
