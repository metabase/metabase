(ns metabase.collections.curation
  "Canonical definition of \"curated\" content for Metabot's \"verified or curated content\" setting.
  Curated content is verified cards/dashboards, official-collection content, library/published content,
  or authoritative tables.
  [[curated?]] is the predicate; [[curated-honeysql]] is its SQL mirror for migrations.
  (The source-of-truth variant that reads signals from cards/dashboards/tables lives in
  `metabase.metabot.curation`, since this foundational module shouldn't reference those higher-level models.)"
  (:require
   [metabase.collections.models.collection :as collection]))

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
  "Whether the given curation-signal map is curated. THIS IS THE AUTHORITATIVE RULE.
  Reads `:model` `:verified` `:official_collection` `:is_published` `:root_collection_type`
  `:data_layer` `:data_authority`; text signals may be strings or keywords.

  Several places re-encode or apply this rule and MUST be kept in sync when it changes:
    - [[curated-honeysql]] — SQL mirror of this predicate (used by the semantic backfill)
    - metabase.search.in-place.filter/build-optional-filter-query (the `[:curated …]` methods) — in-place
      engine SQL filter
    - metabase.metabot.tools.util/metabot-metrics-and-models-query — suggested-prompt source filter
    - metabase.metabot.curation/curated-ids — source-of-truth check for recent views
    - metabase-enterprise.semantic-search.db.migration.impl/add-data-authority-and-curated-columns! —
      recomputes the precomputed `curated` column for existing index rows

  The signals above are populated at ingestion by the search specs, so a NEW signal must also be added to
  metabase.queries.models.card, metabase.dashboards.models.dashboard, metabase.warehouse-schema.models.table
  (and metabase.search.spec attr-types), and reaches existing rows only on reindex / via the migration above."
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
  Keep in sync with [[curated?]] (the authoritative rule).
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
