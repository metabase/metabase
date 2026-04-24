(ns metabase-enterprise.data-complexity-score.complexity
  "Computes a multi-dimensional complexity score for the semantic layer of this Metabase instance.

  Three catalogs are scored:

    :library  — the curated subset (Cards of type :model and :metric)
    :universe — everything (library entities + all active physical tables)
    :metabot  — what the internal Metabot can actually surface. Identical to :universe unless the
                caller passes `:metabot-scope {:verified-only? <bool> :collection-id <nil|Long>}`
                describing how the internal Metabot filters retrieval. The caller owns the
                decision — this namespace does not read settings, premium-feature gates, or
                Metabot rows directly.

  Five dimensions are reported:

    :scale       size of the catalog (neutral polarity — bigger ≠ worse, but still drives choice-
                 space difficulty)
    :nominal     string-level naming disorder (collisions + density + concentration)
    :semantic    embedding-level disambiguation (graph analytics over a 0.80-similarity graph,
                 MiniLM-L6-v2 STS vectors on names-split text)
    :structural  (not yet implemented — deferred to tier 3)
    :metadata    positive-polarity coverage of descriptions / semantic_types / measures — NOT
                 summed into the aggregate total; reported alongside as a `:coverage` ratio

  Cost is controlled by a tier level (see `settings/semantic-complexity-level`): level 1 is cheap
  DB-only; level 2 adds the semantic graph (embeds names via ollama/MiniLM on every run — the
  search index's Arctic vectors are no longer reused); level ≥ 3 will add structural once
  implemented.

  Per-dimension math lives in `metrics/*` namespaces. This file owns enumeration, scope resolution,
  Snowplow emission, and the top-level coordination between dimensions."
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.data-complexity-score.complexity-embedders :as embedders]
   [metabase-enterprise.data-complexity-score.metrics.metadata :as metrics.metadata]
   [metabase-enterprise.data-complexity-score.metrics.nominal :as metrics.nominal]
   [metabase-enterprise.data-complexity-score.metrics.scale :as metrics.scale]
   [metabase-enterprise.data-complexity-score.metrics.semantic :as metrics.semantic]
   [metabase-enterprise.data-complexity-score.settings :as settings]
   [metabase.analytics.core :as analytics]
   [metabase.audit-app.core :as audit]
   [metabase.collections.core :as collections]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def formula-version
  "Bump when the scoring formula changes in a way that breaks historical comparisons.
   v2 raised the synonym-similarity threshold from 0.30 to 0.90.
   v3 reshaped the output into five dimensions and added density, concentration, graph-analytic,
   field-level-collision, and metadata-coverage variables.
   v4 switched the synonym axis to MiniLM-L6-v2 (STS, 0.80) on names-split text, replacing the
   Arctic-L search-index vectors at 0.90. The model is fixed via `embedders/default-synonym-model`
   rather than reused from the semantic-search index — precision cutoff vs. retrieval recall."
  4)

;;; ----------------------------------- enumeration -----------------------------------

(defn- table-fields
  "`{table-id [{:name :semantic-type :description} ...]}` for active fields on the given
   `table-ids`. One query, no chatter."
  [table-ids]
  (if (empty? table-ids)
    {}
    (->> (t2/query {:select [:table_id :name :semantic_type :description]
                    :from   [:metabase_field]
                    :where  [:and
                             [:= :active true]
                             [:in :table_id table-ids]]})
         (reduce (fn [acc {:keys [table_id name semantic_type description]}]
                   (update acc table_id (fnil conj [])
                           {:name name :semantic-type semantic_type :description description}))
                 {}))))

(defn- table-measure-names
  "`{table-id [measure-name ...]}` for non-archived Measures on `table-ids`."
  [table-ids]
  (if (empty? table-ids)
    {}
    (->> (t2/select [:model/Measure :table_id :name]
                    :archived false
                    :table_id [:in table-ids])
         (reduce (fn [acc {:keys [table_id name]}]
                   (update acc table_id (fnil conj []) name))
                 {}))))

(defn- ->card-entity
  "Cards contribute 0 to `:field-count` / `:fields` and have no attached Measures — fields live on
   Tables, and the Measure model is Table-keyed. We keep the result-metadata column out of the
   reducible-select query so Card-heavy instances don't balloon per-row footprint."
  [{:keys [id name type description]}]
  {:id            id
   :name          name
   :kind          (keyword type)
   :description   description
   :field-count   0
   :fields        []
   :measure-names []})

(defn- ->table-entity [fields-by-table measure-names {:keys [id name description]}]
  (let [fields (get fields-by-table id [])]
    {:id            id
     :name          name
     :kind          :table
     :description   description
     :field-count   (count fields)
     :fields        fields
     :measure-names (get measure-names id [])}))

(defn- library-collection-ids
  "Set of collection IDs that make up the Library (root + descendants). Empty set when the
   instance has no Library yet."
  []
  (into #{}
        (when-let [root (collections/library-collection)]
          (cons (:id root) (collections/descendant-ids root)))))

(defn- collect-card-entities
  [filter-kvs]
  (into []
        (map ->card-entity)
        (apply t2/reducible-select
               [:model/Card :id :name :type :description :card_schema]
               filter-kvs)))

(defn- assemble-table-entities [tables]
  (let [table-ids     (mapv :id tables)
        fields-by-tbl (table-fields table-ids)
        measure-names (table-measure-names table-ids)]
    (mapv #(->table-entity fields-by-tbl measure-names %) tables)))

(defn- universe-collection-count
  "Non-archived, non-personal collections. Personal collections are per-user and excluded from
   the shared catalog view; archived collections aren't navigable. Audit-DB filtering happens on
   the entity side (by `database_id`), not here — collections don't have a `database_id` column."
  []
  (or (t2/count :model/Collection :archived false :personal_owner_id nil) 0))

(defn library-catalog
  "Library catalog enumeration — non-archived metric/model Cards and published Tables inside the
   Library collection tree, plus the count of collections in that tree."
  []
  (let [coll-ids (library-collection-ids)]
    (if (empty? coll-ids)
      {:entities [] :collection-count 0}
      (let [cards  (collect-card-entities [:type          [:in ["metric" "model"]]
                                           :archived      false
                                           :collection_id [:in coll-ids]])
            tables (t2/select [:model/Table :id :name :description]
                              :active        true
                              :is_published  true
                              :collection_id [:in coll-ids])]
        {:entities         (into cards (assemble-table-entities tables))
         :collection-count (count coll-ids)}))))

(defn universe-catalog
  "Universe catalog enumeration — every non-archived metric/model Card and every active physical
   Table on this instance (excluding audit content), plus the catalog-wide collection count."
  []
  (let [cards  (collect-card-entities [:type        [:in ["metric" "model"]]
                                       :archived    false
                                       :database_id [:not= audit/audit-db-id]])
        tables (t2/select [:model/Table :id :name :description]
                          :active true
                          :db_id  [:not= audit/audit-db-id])]
    {:entities         (into cards (assemble-table-entities tables))
     :collection-count (universe-collection-count)}))

(defn- metabot-collection-scope-ids
  "Collection IDs the internal Metabot can see — its `collection_id` plus descendants. nil when
   no collection scope is configured. Even if the collection row can't be loaded (stale id), we
   still return a singleton set with the raw id so the catalog matches
   `metabot-metrics-and-models-query`, which filters on the raw `collection_id` and returns an
   empty result rather than dropping the filter."
  [collection-id]
  (when collection-id
    (into #{collection-id}
          (when-let [root (t2/select-one :model/Collection :id collection-id)]
            (collections/descendant-ids root)))))

(defn- metabot-card-entities
  "Cards the internal Metabot would actually surface, optionally restricted to a collection
   subtree and/or to verified-moderation Cards. Mirrors the filters in
   `metabase.metabot.tools.util/metabot-metrics-and-models-query`."
  [{:keys [verified-only? collection-id]}]
  (let [coll-ids (metabot-collection-scope-ids collection-id)
        where    (cond-> [:and
                          [:in :report_card.type [:inline ["metric" "model"]]]
                          [:= :report_card.archived false]
                          [:not= :report_card.database_id audit/audit-db-id]]
                   coll-ids       (conj [:in :report_card.collection_id coll-ids])
                   verified-only? (conj [:= :mr.status [:inline "verified"]]))
        query    (cond-> {:select [:report_card.id :report_card.name :report_card.type
                                   :report_card.description :report_card.card_schema]
                          :from   [[:report_card]]
                          :where  where}
                   verified-only? (assoc :left-join
                                         [[:moderation_review :mr]
                                          [:and
                                           [:= :mr.moderated_item_id :report_card.id]
                                           [:= :mr.moderated_item_type [:inline "card"]]
                                           [:= :mr.most_recent true]]]))]
    (into []
          (map ->card-entity)
          (t2/reducible-select :model/Card query))))

(defn metabot-catalog
  "Metabot catalog when any Metabot retrieval scope is in effect (verified-only, a collection
   subtree, or both). Cards are filtered to match Metabot retrieval; Tables pass through
   unfiltered because Metabot doesn't scope Tables by `collection_id` and there's no table-level
   verification concept. Collection count is the Metabot scope subtree when present, otherwise
   the full universe count."
  [scope]
  (let [card-entities (metabot-card-entities scope)
        tables        (t2/select [:model/Table :id :name :description]
                                 :active true
                                 :db_id  [:not= audit/audit-db-id])
        coll-ids      (metabot-collection-scope-ids (:collection-id scope))]
    {:entities         (into card-entities (assemble-table-entities tables))
     :collection-count (or (some-> coll-ids count) (universe-collection-count))}))

;;; ------------------------------------- scoring -------------------------------------

(defn- catalog-total
  "Sum sub-totals across additive dimensions (everything except `:metadata`)."
  [dimensions]
  (reduce + 0 (keep :sub-total (vals (dissoc dimensions :metadata)))))

(defn score-catalog
  "Pure: compute the dimension breakdown for a catalog given its `entities`, a context map
  `{:collection-count <long>}`, an optional `embedder`, and an integer `level` (1 or 2 within
  this build). Returns `{:dimensions {...} :total <long>}`."
  [entities {:keys [collection-count]} embedder level]
  (let [scale-b      (when (>= ^long level 1)
                       (metrics.scale/score entities {:collection-count collection-count}))
        nominal-b    (when (>= ^long level 1)
                       (metrics.nominal/score entities))
        embedder-out (when (>= ^long level 2)
                       (metrics.semantic/embedder-result entities embedder))
        emb-cov      (when embedder-out
                       (metrics.semantic/embedding-coverage entities embedder-out))
        semantic-b   (when (>= ^long level 2)
                       (metrics.semantic/score entities embedder-out))
        metadata-b   (when (>= ^long level 1)
                       (metrics.metadata/score entities {:embedding-coverage emb-cov}))
        dimensions   (cond-> {}
                       scale-b    (assoc :scale scale-b)
                       nominal-b  (assoc :nominal nominal-b)
                       semantic-b (assoc :semantic semantic-b)
                       metadata-b (assoc :metadata metadata-b))]
    {:dimensions dimensions
     :total      (catalog-total dimensions)}))

;;; ----------------------------------- public API ------------------------------------

(defn- log-scores!
  "Write the computed result to application logs. Operators get this even when Snowplow isn't
   reachable, since scoring only runs at startup and on the superuser recompute endpoint."
  [result]
  (log/info (str "Semantic complexity score:\n"
                 #_{:clj-kondo/ignore [:discouraged-var]}
                 (with-out-str (pprint/pprint result)))))

(defn- snake ^String [x]
  (-> x name (.replace "-" "_")))

(defn- dotted-key
  "Identifier for a slice in the `data_complexity` schema's `:key` field — `\"total\"` at the
  catalog level, `\"<dimension>.<variable>\"` per leaf. Free-form string per the schema, so new
  variables can be added without a schema bump."
  ([] "total")
  ([dim var] (str (snake dim) "." (snake var))))

(defn- measurement-of
  "Publish the raw pre-score measurement alongside each variable event so downstream can track
   count/pairs without inverting the weight map."
  [var-map]
  (when-let [v (:value var-map)]
    (when (number? v) v)))

(def ^:private max-error-length
  "Matches the `data_complexity` Snowplow schema's `error` maxLength — a pathological exception
  message must not fail validation and drop the whole event."
  1024)

(defn- truncate-error [s]
  (cond-> s (< max-error-length (count s)) (subs 0 max-error-length)))

(defn- parameters-map
  "Sorted-map of scoring inputs likely to evolve, published as a JSON object on each event.
  String keys (top-level and nested) so they round-trip unchanged — Snowplow's `payload` only
  snake-cases top-level keys, and Cheshire would serialize nested keyword keys with their leading
  colon. `formula_version` stays top-level as the primary cross-version filter."
  [{:keys [level synonym-threshold embedding-model]}]
  (cond-> (sorted-map "level" level)
    synonym-threshold (assoc "synonym_threshold" synonym-threshold)
    embedding-model   (assoc "embedding_model_provider" (:provider embedding-model)
                             "embedding_model_name"     (:model-name embedding-model))))

(defn- emit-catalog-snowplow!
  "Emit Snowplow events for one catalog. One `key=\"total\"` event for the catalog total, then one
  per `(dimension, variable)` leaf. Events conform to `data_complexity` schema 1-0-0."
  [catalog {:keys [dimensions total]} base]
  (analytics/track-event!
   :snowplow/data_complexity
   (assoc base :catalog catalog :key (dotted-key) :score total))
  (doseq [[dim {:keys [variables]}] dimensions
          [var-k var-map]           variables
          :let [payload (cond-> (assoc base
                                       :catalog catalog
                                       :key     (dotted-key dim var-k)
                                       :score   (:score var-map))
                          (measurement-of var-map) (assoc :measurement (measurement-of var-map))
                          (:error var-map)         (assoc :error (truncate-error (:error var-map))))]]
    (analytics/track-event! :snowplow/data_complexity payload)))

(defn- emit-snowplow! [{:keys [library universe metabot meta]}]
  (let [base {:event           :data_complexity_scoring
              :formula_version (:formula-version meta)
              :parameters      (parameters-map meta)}]
    (doseq [[catalog result] [[:library library] [:universe universe] [:metabot metabot]]]
      (emit-catalog-snowplow! catalog result base))))

(defn- empty-score [] {:dimensions {} :total 0})

(defn score-from-entities
  "Pure: compute the full complexity score from pre-built entity vectors and an embedder.
  No DB access, no Snowplow emission.

  Options:
    `:level`                ceiling on which dimensions to compute; defaults to the setting
                            (`settings/effective-level`). Level 0 short-circuits — empty blocks
                            for every catalog and no embedder call.
    `:embedding-model-meta` optional `{:provider ... :model-name ...}` stashed into `:meta`.
    `:metabot-catalog`      optional `{:entities [...] :collection-count N}` for the `:metabot`
                            catalog. When absent (default), `:metabot` reuses the universe score."
  [{lib-entities :entities lib-coll :collection-count :as _library-catalog}
   {uni-entities :entities uni-coll :collection-count :as _universe-catalog}
   embedder
   {:keys [level embedding-model-meta metabot-catalog]}]
  (let [level        (settings/clamp-level (or level (settings/semantic-complexity-level)))
        empty-result {:library  (empty-score)
                      :universe (empty-score)
                      :metabot  (empty-score)
                      :meta     (cond-> {:formula-version formula-version :level 0}
                                  embedding-model-meta (assoc :embedding-model embedding-model-meta))}]
    (if (zero? ^long level)
      empty-result
      (let [universe-score (score-catalog uni-entities {:collection-count uni-coll} embedder level)]
        {:library  (score-catalog lib-entities {:collection-count lib-coll} embedder level)
         :universe universe-score
         :metabot  (if metabot-catalog
                     (score-catalog (:entities metabot-catalog)
                                    {:collection-count (:collection-count metabot-catalog)}
                                    embedder
                                    level)
                     universe-score)
         :meta     (cond-> {:formula-version formula-version :level level}
                     (>= ^long level 2)   (assoc :synonym-threshold
                                                 metrics.semantic/synonym-similarity-threshold)
                     embedding-model-meta (assoc :embedding-model embedding-model-meta))}))))

(defn- metabot-scope-applies? [{:keys [verified-only? collection-id]}]
  (or (boolean verified-only?) (some? collection-id)))

(defn complexity-scores
  "Compute the complexity score for the `:library`, `:universe`, and `:metabot` catalogs.

  Returns

    {:library {:dimensions {:scale {...} :nominal {...} :semantic {...} :metadata {...}}
               :total <long>}
     :universe {…}
     :metabot  {…}
     :meta     {:formula-version 3 :level <int> :synonym-threshold <float> :embedding-model {…}}}

  Options:
    `:embedder`      overrides the synonym-axis embedder; pass `nil` to disable synonym scoring.
    `:metabot-scope` `{:verified-only? <bool> :collection-id <nil|Long>}` — see ns docstring.
    `:level`         override the level setting for this call (rare; mainly for tests)."
  [& {:keys [embedder metabot-scope level] :as opts}]
  (let [level      (settings/clamp-level (or level (settings/semantic-complexity-level)))
        embedder   (if (contains? opts :embedder) embedder embedders/default-synonym-embedder)
        model-meta (when (and (pos? ^long level)
                              (>= ^long level 2)
                              (= embedder embedders/default-synonym-embedder))
                     (select-keys embedders/default-synonym-model [:provider :model-name]))
        [library universe metabot]
        (if (zero? ^long level)
          [{:entities [] :collection-count 0}
           {:entities [] :collection-count 0}
           nil]
          [(library-catalog)
           (universe-catalog)
           (when (metabot-scope-applies? metabot-scope) (metabot-catalog metabot-scope))])
        result (score-from-entities library universe embedder
                                    {:level                level
                                     :embedding-model-meta model-meta
                                     :metabot-catalog      metabot})]
    (log-scores! result)
    (try (emit-snowplow! result)
         (catch Throwable t
           (log/warn t "Failed to publish complexity score to Snowplow")))
    result))

(comment
  (complexity-scores))
