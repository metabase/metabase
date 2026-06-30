(ns metabase.metabot.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.search-models :as metabot.search-models]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private metabot-search-models
  (sorted-set "card" "collection" "dashboard" "database" "dataset"
              "measure" "metric" "segment" "table" "transform"))

(def ^:private metabot-weight-overrides
  "Per-request weight overrides applied to every metabot search. Boosts curator signals
   (verified, official-collection) so curated content surfaces ahead of obscure items.
   The LLM has no implicit affordance to 'trust' results otherwise — these signals are
   how a human user would visually distinguish 'safe' content. text/exact stay at the
   defaults (5) so on-topic results still win — curation only breaks near-ties."
  {:official-collection 4
   :verified            5
   :view-count          3})

(defn- postprocess-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection official_collection data_authority curated data_layer] :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        official? (boolean official_collection)
        collection-info (select-keys collection [:id :name :authority_level])
        ;; Curation signals beyond verified, so the LLM can see *why* content is curated. `:curated` is
        ;; the precomputed rollup (present on the appdb/semantic engines); `:data_layer` is table-only.
        ;; assoc-some keeps them off results that don't carry them (e.g. the in-place fallback).
        common-fields {:id                  (:id result)
                       :type                (metabot.search-models/search-model->entity-type model)
                       :name                (:name result)
                       :description         (:description result)
                       :updated_at          (:updated_at result)
                       :created_at          (:created_at result)
                       :official_collection official?
                       :verified            verified?}]
    (case model
      "database"
      common-fields

      "collection"
      ;; A collection has no database/base-table; surface its own curation level and parent location.
      ;; `:is_container true` marks it (like dashboards) as a thing the LLM drills *into* rather than
      ;; queries directly. `:authority_level` is the collection's own curation level (a collection's
      ;; authority lives on the collection row itself, not a parent), distinct from `:official?`
      ;; which is derived from `official_collection`.
      (-> common-fields
          (merge {:official        official?
                  :is_container    true})
          (m/assoc-some :authority_level (:authority_level result)
                        :location        (:location result)))

      "table"
      (-> common-fields
          (merge {:name            (:table_name result)
                  :display_name    (:name result)
                  :database_id     (:database_id result)
                  :database_schema (:table_schema result)
                  :official        official?
                  :data_authority  data_authority})
          (m/assoc-some :curated curated :data_layer data_layer))

      "dashboard"
      (-> common-fields
          (merge {:verified     verified?
                  :official     official?
                  :collection   collection-info
                  :is_container true})
          (m/assoc-some :curated curated))

      "transform"
      (merge common-fields
             {:database_id (:database_id result)})

      ;; Measures and segments are bound to a specific table; the LLM needs that table's
      ;; identity to use them in queries. The search row already carries the joined
      ;; table fields (see `:render-terms` on the measure/segment search spec); we just
      ;; copy them through here. `:base_table_portable_fk` is then assembled in
      ;; [[enrich-with-base-tables]] once `database_name` is known.
      ("measure" "segment")
      (merge common-fields
             {:database_id       (:database_id result)
              :base_table_id     (:table_id result)
              :base_table_name   (:table_name result)
              :base_table_schema (:table_schema result)
              :base_table_display_name (:table_display_name result)})

      ;; Questions, metrics, and datasets
      (-> common-fields
          (merge {:database_id (:database_id result)
                  :official    official?
                  :collection  collection-info})
          (m/assoc-some :curated curated)))))

(defn- enrich-with-collection-descriptions
  "Fetch and merge collection descriptions for all search results that have collection IDs."
  [results]
  (let [coll-ids     (->> results (keep #(get-in % [:collection :id])) distinct)
        descriptions (when (seq coll-ids)
                       (t2/select-pk->fn :description :model/Collection :id [:in coll-ids]))]
    (cond->> results
      (seq descriptions) (mapv (fn [r]
                                 (let [cid (-> r :collection :id)]
                                   (update r :collection m/assoc-some :description (get descriptions cid))))))))

(defn- collection-result?
  "Whether a postprocessed result represents a collection itself (vs. an item *in* a collection)."
  [r]
  (= "collection" (:type r)))

(defn- result-collection-id
  "The collection id this result lives in (or, for collection results, the collection's own id)."
  [r]
  (if (collection-result? r) (:id r) (get-in r [:collection :id])))

(defn- ancestor-ids
  "Parse a Collection :location string like \"/12/34/\" into [12 34]."
  [location]
  (when (and location (not= "/" location))
    (->> (str/split location #"/") (remove str/blank?) (keep parse-long))))

(def ^:private library-collection-types
  "Collection `:type` values that make up the curated library. A result is a library member
   when its *root* (top-level) collection is one of these — matching the search `:library`
   scorer, which keys off `root_collection_type` (see `metabase.search.scoring/library-score-expr`)."
  #{"library" "library-data" "library-metrics"})

(defn- enrich-with-collection-paths
  "Stamp each collection-bearing result with :collection_path (and :full_path for collection
   results) and :library_member (boolean, gated by the :library premium feature).

   :collection_path is the slash-joined chain of ancestor names ending in the result's
   collection name (e.g. \"Marketing/Q4 Reports/Email\"). For collection-typed results,
   the same string is also exposed as :full_path.

   :library_member is true when the result's top-level (root) collection is a library-type
   collection. Tables have no collection; their library membership is set from the data layer
   by [[enrich-tables-with-data-layer]]."
  [results]
  (let [direct-ids   (->> results (keep result-collection-id) distinct)
        ;; Bulk-fetch direct collections (with their effective location, which elides ancestors
        ;; the current user can't read) so we can chase ancestors permission-safely.
        direct-rows  (when (seq direct-ids)
                       (t2/hydrate (t2/select [:model/Collection :id :location] :id [:in direct-ids])
                                   :effective_location))
        id->eff-loc  (into {} (map (juxt :id :effective_location)) direct-rows)
        ;; Chase ancestors from the *raw* location so library-member detection (which reads the
        ;; root's :type, not its name) still works even when the root isn't readable.
        ancestor-id-set  (->> direct-rows (mapcat (comp ancestor-ids :location)) (into #{}))
        all-ids          (into (set direct-ids) ancestor-id-set)
        coll-rows    (when (seq all-ids)
                       (t2/select [:model/Collection :id :name :location :type]
                                  :id [:in all-ids]))
        id->row      (into {} (map (juxt :id identity)) coll-rows)
        path-of      (fn [coll-id]
                       (when-let [{:keys [name]} (get id->row coll-id)]
                         ;; Only readable ancestors (from :effective_location) contribute names,
                         ;; so we never leak the name of a collection the user can't see.
                         (let [ancestor-names (->> (ancestor-ids (get id->eff-loc coll-id))
                                                   (keep #(get-in id->row [% :name])))]
                           (str/join "/" (concat ancestor-names [name])))))
        library?     (premium-features/has-feature? :library)
        ;; A collection's root is its top-level ancestor, or itself when it's already top-level.
        root-type-of (fn [coll-id]
                       (let [root-id (or (first (ancestor-ids (get-in id->row [coll-id :location])))
                                         coll-id)]
                         (get-in id->row [root-id :type])))
        library-of   (fn [coll-id]
                       (boolean (and library?
                                     coll-id
                                     (library-collection-types (root-type-of coll-id)))))]
    (mapv (fn [r]
            (let [cid  (result-collection-id r)
                  path (when cid (path-of cid))]
              (cond-> r
                path (assoc :collection_path path)
                (and path (collection-result? r)) (assoc :full_path path)
                cid  (assoc :library_member (library-of cid)))))
          results)))

(defn- enrich-tables-with-data-layer
  "Tables aren't in collections, so their library membership comes from the data layer instead:
   a table is a library member when its `data_layer` is `:final` (the published tier). Gated by
   the :library premium feature, mirroring [[enrich-with-collection-paths]]."
  [results]
  (let [table-ids (->> results (filter #(= "table" (:type %))) (keep :id) distinct)
        id->layer (when (and (premium-features/has-feature? :library) (seq table-ids))
                    (t2/select-fn->fn :id :data_layer :model/Table :id [:in table-ids]))]
    (if id->layer
      (mapv (fn [r]
              (cond-> r
                (= "table" (:type r)) (assoc :library_member (= :final (id->layer (:id r))))))
            results)
      results)))

(defn- enrich-with-database-engines
  "Fetch and merge database engine + name info for search results that have database IDs.
  `:database_name` is the human-readable name the LLM needs as the first slot of every
  portable FK in `construct_notebook_query`; surfacing it on every table/model search
  result means the LLM doesn't need a separate `entity_details` round-trip just to learn
  the DB name."
  [results]
  (let [db-ids (->> results (keep :database_id) distinct)
        id->db (when (seq db-ids)
                 (t2/select-pk->fn (juxt :engine :name) :model/Database :id [:in db-ids]))]
    (cond->> results
      (seq id->db) (mapv (fn [r]
                           (let [[engine db-name] (get id->db (:database_id r))]
                             (-> r
                                 (m/assoc-some :database_engine engine)
                                 (m/assoc-some :database_name db-name))))))))

(defn- enrich-with-portable-entity-ids
  "Attach `:portable_entity_id` (the entity's `entity_id` NanoID) to saved-question, model,
  metric, measure, and segment search results so the LLM can use it verbatim as
  `source-card:` (for questions/models) or inside a `[metric|measure|segment, {}, <eid>]`
  clause without a follow-up `entity_details` / `read_resource` round-trip.

  Each entity type lives in its own table (`report_card` for cards/metrics,
  `metabase_measure`, `metabase_segment`), so we issue one lookup per family but keep
  them O(1) per search call regardless of how many of each appear in the result set."
  [results]
  (let [card-types  #{"question" "model" "metric"}
        type->model {"measure" :model/Measure
                     "segment" :model/Segment}
        card-ids    (->> results (filter #(card-types (:type %))) (keep :id) distinct)
        card-id->eid (when (seq card-ids)
                       (t2/select-pk->fn :entity_id :model/Card :id [:in card-ids]))
        other-eid-lookups (into {}
                                (map (fn [[type model]]
                                       (let [ids (->> results (filter #(= type (:type %))) (keep :id) distinct)]
                                         (when (seq ids)
                                           [type (t2/select-pk->fn :entity_id model :id [:in ids])]))))
                                type->model)]
    (mapv (fn [r]
            (let [eid (cond
                        (card-types (:type r)) (get card-id->eid (:id r))
                        (contains? type->model (:type r))
                        (get-in other-eid-lookups [(:type r) (:id r)]))]
              (cond-> r
                eid (assoc :portable_entity_id eid))))
          results)))

(defn- enrich-with-base-tables
  "Attach base-table info (`:base_table_id`, `:base_table_name`, `:base_table_schema`,
  `:base_table_portable_fk`) to metric / measure / segment search results.

  For each, the LLM needs the binding table's portable FK as the `source-table:` when
  building a query. Without this enrichment the LLM sees the entity's name but has to
  hallucinate the base table (observed failure mode: `[<db>, public, customers]`) or do
  an extra `entity_details` round-trip.

  - **Metrics** are Cards (saved questions of type `:metric`); the table id lives on
    `report_card.table_id`, so we look that up here and join through `metabase_table`.
  - **Measures** and **segments** already carry the join'd table fields on the search
    row (see `:render-terms` + `:joins` in their search specs), so
    [[postprocess-search-result]] has already copied `:base_table_*` through and this
    step only needs to attach the portable FK.

  Requires `:database_name` to already be set (done by [[enrich-with-database-engines]])
  so we can assemble the full portable FK `[database_name, schema, table]`."
  [results]
  (let [metric-ids (->> results (filter #(= "metric" (:type %))) (keep :id) distinct)
        card-id->table-id (when (seq metric-ids)
                            (t2/select-pk->fn :table_id :model/Card :id [:in metric-ids]))
        table-ids (->> card-id->table-id vals (remove nil?) distinct)
        table-id->info (when (seq table-ids)
                         (t2/select-pk->fn (juxt :schema :name) :model/Table :id [:in table-ids]))
        attach-portable-fk (fn [r]
                             (let [{:keys [database_name base_table_schema base_table_name]} r]
                               (cond-> r
                                 (and database_name base_table_name)
                                 (assoc :base_table_portable_fk
                                        [database_name base_table_schema base_table_name]))))]
    (mapv (fn [r]
            (cond
              (= "metric" (:type r))
              (let [table-id (get card-id->table-id (:id r))
                    [schema table-name] (when table-id (get table-id->info table-id))]
                (cond-> r
                  table-id   (assoc :base_table_id table-id)
                  table-name (assoc :base_table_name table-name
                                    :base_table_schema schema)
                  table-name attach-portable-fk))

              (#{"measure" "segment"} (:type r))
              ;; Table fields were already copied through by postprocess-search-result;
              ;; just attach the portable FK now that database_name is known.
              (attach-portable-fk r)

              :else r))
          results)))

(defn- remove-unreadable-transforms
  "Remove transforms from search results that the user cannot read.
  This filters out transforms where the user doesn't have access to the source tables/database."
  [results]
  (let [transform-ids (->> results (filter #(= "transform" (:type %))) (map :id) set)
        readable-ids (when (seq transform-ids)
                       (->> (t2/select :model/Transform :id [:in transform-ids])
                            transforms/add-source-readable
                            (filter :source_readable)
                            (map :id)
                            set))]
    (cond->> results
      (seq transform-ids) (filterv (fn [result]
                                     (or (not= "transform" (:type result))
                                         (contains? readable-ids (:id result))))))))

(def ^:private query-broadening-stopwords
  "Tokens we don't include in an OR-broadened fallback query — they'd flood the result
   set with noise without adding signal."
  #{"the" "a" "an" "of" "for" "with" "on" "in" "to" "by" "at" "and" "or"})

(defn- broaden-query
  "When the original keyword query produces zero hits, the agent has typically over-
   specified — every word is ANDed and one stray qualifier (e.g. \"hard bounce rate
   campaign\") collapses the result set to empty. As a one-shot fallback we rejoin the
   meaningful tokens with `or` so the engine compiles them with `|` semantics.

   Returns nil (no fallback) when broadening doesn't apply:
     - the query is empty or a single token
     - the agent already used `or` (so OR-broadening would be redundant)
     - the agent used a quoted phrase (treat as a deliberate exact-match intent)"
  [q]
  (when (and q
             (not (str/includes? q "\""))
             (not (re-find #"(?i)\bor\b" q)))
    (let [tokens (->> (str/split q #"\s+")
                      (map str/trim)
                      (remove str/blank?)
                      (remove #(query-broadening-stopwords (u/lower-case-en %))))]
      (when (> (count tokens) 1)
        (str/join " or " tokens)))))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics, measures,
   segments, transforms) in Metabase.

   Routes the query to the semantic engine when available — that engine already does
   hybrid keyword + semantic RRF fusion at the SQL level (see
   `metabase-enterprise.semantic-search.scoring/rrf-rank-exp`). When semantic isn't
   available, falls back to the default keyword engine. No metabot-level fusion is
   needed in either case.

   The keyword (appdb) engine ANDs every token in the input — adding an extra qualifier
   word can collapse the result set to zero. When the initial call returns no hits we
   transparently retry once with the tokens OR-joined via [[broaden-query]] so the
   agent gets *something* useful back. Skipped when the query is a single token, is
   quoted, or already uses `or`."
  [{:keys [query database-id collection-id created-at last-edited-at
           entity-types limit metabot-id profile-id search-native-query weights]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:query               query
              :database-id         database-id
              :created-at          created-at
              :last-edited-at      last-edited-at
              :entity-types        entity-types
              :limit               limit
              :metabot-id          metabot-id
              :profile-id          profile-id
              :search-native-query search-native-query
              :weights             weights})
  (let [search-models   (if (seq entity-types)
                          (set (distinct (keep metabot.search-models/entity-type->search-model entity-types)))
                          metabot-search-models)
        _               (log/infof "[METABOT-SEARCH] Converted entity-types %s to search-models %s" entity-types search-models)
        metabot         (t2/select-one :model/Metabot :entity_id (get-in metabot.config/metabot-config [metabot-id :entity-id] metabot-id))
        use-verified?   (if metabot-id
                          (:use_verified_content metabot)
                          false)
        embedded-metabot?  (= metabot-id metabot.config/embedded-metabot-id)
        ;; Caller-supplied `collection-id` wins; otherwise fall back to the metabot's
        ;; configured collection for embedded/NLQ profiles.
        collection-id   (or collection-id
                            (when (or embedded-metabot? (= profile-id "nlq"))
                              (:collection_id metabot)))
        ;; Always merge the metabot curator-boost overrides; explicit `:weights` from
        ;; the caller wins on a per-key basis so callers can still tune.
        weights         (merge metabot-weight-overrides weights)
        limit           (or limit 50)
        ;; Pick the engine that will actually run the search. Semantic handles its own
        ;; hybrid (keyword + vector) blend internally, so it gets first refusal when
        ;; active. Otherwise fall through to whatever the instance's default precedence
        ;; resolves to — typically appdb, but could be `in-place` on minimal installs.
        ;; Locking the choice in here (rather than relying on `search-context` to
        ;; default it later) lets downstream code branch on the actual engine.
        picked-engine   (or (u/seek #{:search.engine/semantic} (search.engine/active-engines))
                            (search.engine/default-engine))
        run-engine      (fn [search-string]
                          (let [search-context
                                (search/search-context
                                 (cond-> {:search-string                       search-string
                                          :models                              search-models
                                          :search-engine                       (name picked-engine)
                                          :table-db-id                         database-id
                                          :created-at                          created-at
                                          :last-edited-at                      last-edited-at
                                          :current-user-id                     api/*current-user-id*
                                          :is-impersonated-user?               (perms/impersonated-user?)
                                          :is-sandboxed-user?                  (perms/sandboxed-user?)
                                          :is-superuser?                       api/*is-superuser?*
                                          :current-user-perms                  @api/*current-user-permissions-set*
                                          :filter-items-in-personal-collection "exclude-others"
                                          :context                             :metabot
                                          :archived                            false
                                          :limit                               limit
                                          :offset                              0}
                                   ;; Don't include search-native-query key if nil so that we don't
                                   ;; inadvertently filter out search models that don't support it
                                   search-native-query (assoc :search-native-query (boolean search-native-query))
                                   use-verified?       (assoc :curated true)
                                   weights             (assoc :weights weights)
                                   collection-id       (assoc :collection collection-id)))]
                            (:data (search/search search-context))))
        primary         (run-engine query)
        ;; Zero-hit fallback is appdb-only. The semantic engine already fuses keyword and
        ;; vector matching, so OR-broadening on top is redundant; the `in-place` engine
        ;; uses different matching semantics (LIKE patterns) where this rewrite doesn't
        ;; apply cleanly. So we gate explicitly on `:search.engine/appdb`.
        results         (or (when (and (empty? primary)
                                       (= picked-engine :search.engine/appdb))
                              (when-let [broadened (broaden-query query)]
                                (log/infof "[METABOT-SEARCH] Zero hits for '%s'; broadening to '%s'"
                                           query broadened)
                                (not-empty (run-engine broadened))))
                            primary)]
    (log/infof "[METABOT-SEARCH] Query '%s' returned entity types: %s"
               query (frequencies (map :model results)))
    (->> results
         (take limit)
         (map postprocess-search-result)
         enrich-with-collection-descriptions
         enrich-with-collection-paths
         enrich-tables-with-data-layer
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-base-tables
         remove-unreadable-transforms)))

(defn- table-refs->results
  [ids]
  (when (seq ids)
    ;; only surface tables the current user can read — a curated entry may point at one they can't access
    (for [t (filter mi/can-read?
                    (t2/select [:model/Table :id :name :display_name :db_id :schema :description] :id [:in ids]))]
      {:id              (:id t)
       :type            "table"
       :name            (:name t)
       :display_name    (:display_name t)
       :database_id     (:db_id t)
       :database_schema (:schema t)
       :description     (:description t)})))

(defn- card-refs->results
  "Build post-processed search-result records for card-backed refs (`{:id .. :type \"model\"|\"metric\"|\"question\"}`).
  Emits one record per distinct card id, carrying the card's *current* type — so the same card registered
  under two (possibly stale) type strings collapses to a single record rather than duplicating."
  [refs]
  (let [ids       (distinct (map :id refs))
        ;; only surface cards the current user can read (collection perms) — see table-refs->results
        id->card  (when (seq ids)
                    (into {} (map (juxt :id identity))
                          (filter mi/can-read?
                                  (t2/select [:model/Card :id :name :description :database_id :collection_id
                                              :card_schema :type]
                                             :id [:in ids]))))
        coll-ids  (->> (vals id->card) (keep :collection_id) distinct)
        id->coll  (when (seq coll-ids)
                    (into {} (map (juxt :id identity))
                          (t2/select [:model/Collection :id :name :authority_level] :id [:in coll-ids])))
        ;; verified is already a set (t2/select-fn-set), possibly nil when there were no ids
        verified  (when (seq ids)
                    (t2/select-fn-set :moderated_item_id :model/ModerationReview
                                      :moderated_item_id [:in ids] :moderated_item_type "card"
                                      :most_recent true :status "verified"))]
    (for [id ids
          :let [c (id->card id)]
          :when c]
      (let [coll (get id->coll (:collection_id c))]
        {:id          id
         ;; the Card's *current* type, not the caller's ref type — a stale index hit kept across a
         ;; metric<->model relabel must not describe the entity with its old shape. Card's :type is a
         ;; keyword; emit the agent-facing string so downstream string checks and entity-class still match.
         :type        (some-> (:type c) name)
         :name        (:name c)
         :description (:description c)
         :database_id (:database_id c)
         :verified    (contains? verified id)
         :collection  (when coll (select-keys coll [:id :name :authority_level]))}))))

(defn- measure-segment-refs->results
  "Build search-result records for measure/segment refs (`{:id .. :type \"measure\"|\"segment\"}`),
  carrying parent-table context (database + base table). Only surfaces those whose parent Table the
  current user can read (perms delegate to the table)."
  [refs]
  (when (seq refs)
    (let [by-type (group-by :type refs)
          fetch   (fn [model ids]
                    (when-let [ids (not-empty (distinct ids))]
                      (filter mi/can-read?
                              (t2/select [model :id :name :description :table_id :entity_id] :id [:in ids]))))
          rows    (concat (map #(assoc % :type "measure") (fetch :model/Measure (map :id (get by-type "measure"))))
                          (map #(assoc % :type "segment") (fetch :model/Segment (map :id (get by-type "segment")))))
          tbl-ids (not-empty (distinct (keep :table_id rows)))
          id->tbl (when tbl-ids
                    (into {} (map (juxt :id identity))
                          (t2/select [:model/Table :id :name :schema :db_id] :id [:in tbl-ids])))]
      (for [{:keys [id type name description table_id entity_id]} rows
            :let [t (get id->tbl table_id)]]
        (cond-> {:id id :type type :name name :description description}
          ;; the measure/segment's NanoID — used in a [measure|segment, {}, <id>] clause the way a metric
          ;; uses its portable_entity_id (carded types get theirs in enrich-with-portable-entity-ids).
          entity_id (assoc :portable_entity_id entity_id)
          t         (assoc :database_id       (:db_id t)
                           :base_table_id      (:id t)
                           :base_table_name    (:name t)
                           :base_table_schema  (:schema t)))))))

(defn ref-model->entity-type
  "Normalize an entity ref's `:model` string to the agent-facing entity type: plain cards are
  `\"question\"` everywhere the agent sees them (`read_resource` URIs, search results)."
  [model]
  (if (= model "card") "question" model))

(defn entity-refs->search-results
  "Hydrate semantic-layer entity refs into the enriched search-result shape that
  [[metabase.metabot.tools.shared.llm-shape/search-results->xml]] and the `search` tool consume.

  `refs` is a seq of `{:model <entity-type> :id <id>}` where `<entity-type>` is `\"table\"`, `\"model\"`,
  `\"metric\"`, `\"question\"`, `\"measure\"`, or `\"segment\"` (the names the agent uses with
  `read_resource`); `\"card\"` is accepted and normalized to `\"question\"`.
  Returns records carrying `:portable_entity_id`, `:database_name`, fully-qualified names, metric/measure/
  segment base tables, etc. — everything the LLM needs to build a query without an extra round-trip.
  Refs whose entity no longer exists are dropped."
  [refs]
  (let [by-model  (group-by (comp ref-model->entity-type :model) refs)
        table-ids (distinct (map :id (get by-model "table")))
        card-refs (for [m ["model" "metric" "question"], r (get by-model m)] {:id (:id r) :type m})
        ms-refs   (for [m ["measure" "segment"], r (get by-model m)] {:id (:id r) :type m})]
    (->> (concat (table-refs->results table-ids)
                 (card-refs->results (distinct card-refs))
                 (measure-segment-refs->results (distinct ms-refs)))
         enrich-with-collection-descriptions
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-base-tables
         remove-unreadable-transforms)))

(defn- format-search-output
  "Format search results as an LLM-ready string. One XML element per result so the agent
   can clearly see the type, attributes, and curation tags for each hit. The agent picks
   URIs and feeds them to read_resource for details."
  [query results]
  (let [results-xml (str/join "\n" (map llm-shape/search-result->xml results))]
    (te/lines
     (str "<results query=\"" (when query (llm-shape/escape-xml query))
          "\" total=\"" (count results) "\">")
     results-xml
     "</results>"
     "<instructions>"
     instructions/search-result-instructions "</instructions>")))

(defn- invalid-entity-types
  [entity-types allowed]
  (when (seq entity-types)
    (seq (remove allowed entity-types))))

(def ^:private default-search-limit 25)
(def ^:private max-search-limit 50)

(defn- do-search
  [label allowed-types search-opts {:keys [query entity_types limit
                                           database_id collection_id]
                                    :as _args}]
  (if-let [invalid (invalid-entity-types entity_types allowed-types)]
    {:output (str "Invalid entity_types for " label ": " (pr-str (vec invalid))
                  ". Allowed types: " (str/join ", " allowed-types) ".")}
    (try
      (let [results (search (merge {:query        query
                                    :entity-types (or (seq entity_types) (vec allowed-types))
                                    :metabot-id   shared/*metabot-id*
                                    :limit        (min max-search-limit
                                                       (or limit default-search-limit))}
                                   search-opts
                                   ;; Caller-supplied scope args from the LLM. `database_id`
                                   ;; may also be set via `search-opts` (sql-search), in which
                                   ;; case the explicit map entry from this caller wins.
                                   (cond-> {}
                                     database_id   (assoc :database-id database_id)
                                     collection_id (assoc :collection-id collection_id))))]
        {:output (format-search-output query results)
         :structured-output {:result-type :search
                             :data results
                             :total_count (count results)}})
      (catch Exception e
        (log/error e (str "Error in " label))
        {:output (str "Search failed: " (or (ex-message e) "Unknown error"))}))))

(def ^:private search-schema
  [:map {:closed true}
   [:query :string]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "metric" "measure" "segment"
                          "dashboard" "question" "collection"]]]]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe :int]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit}]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "search.selmer"
           :scope     scope/agent-search}
  search-tool
  "Search for tables, models, metrics, measures, segments, dashboards, saved questions, and collections."
  [args :- search-schema]
  (do-search "search"
             (sorted-set "collection" "dashboard" "measure" "metric" "model"
                         "question" "segment" "table")
             {} args))

(def ^:private sql-search-schema
  [:map {:closed true}
   [:query :string]
   [:database_id :int]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit}]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "sql_search.selmer"
           :scope     scope/agent-search}
  sql-search-tool
  "Search for SQL-queryable data sources (tables and models) within a database."
  [{:keys [database_id] :as args} :- sql-search-schema]
  (do-search "SQL search" (sorted-set "model" "table") {:database-id database_id} args))

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:query :string]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "metric" "measure" "segment"
                          "question" "collection"]]]]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe :int]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit}]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "nlq_search.selmer"
           :scope     scope/agent-search}
  nlq-search-tool
  "Search for NLQ-queryable data sources (tables, models, metrics, measures, segments, questions, and collections)."
  [args :- nlq-search-schema]
  (do-search "NLQ search"
             (sorted-set "collection" "measure" "metric" "model" "question" "segment" "table")
             {:profile-id "nlq"} args))

(def ^:private transform-search-schema
  [:map {:closed true}
   [:query :string]
   [:search_native_query {:optional true} [:maybe :boolean]]
   [:entity_types {:optional true}
    [:maybe [:sequential [:enum "table" "model" "transform"]]]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-search-limit}]]]])

(mu/defn ^{:tool-name "search"
           :prompt    "transform_search.selmer"
           :scope     scope/agent-search}
  transform-search-tool
  "Search for transforms, tables, and models."
  [{:keys [search_native_query] :as args} :- transform-search-schema]
  (do-search "transform search" (sorted-set "model" "table" "transform")
             {:search-native-query search_native_query} args))
