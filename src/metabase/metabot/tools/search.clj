(ns metabase.metabot.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.db :as metabot.db]
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
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private metabot-search-models
  (sorted-set "card" "collection" "dashboard" "database" "dataset" "document"
              "measure" "metric" "segment" "table" "transform"))

(def ^:private metabot-weight-overrides
  "Per-request weight overrides applied to every metabot search. Nudges the curation badges
   (:official-collection, :verified — default 1) and popularity (:view-count — default 2) up
   so they break near-ties: the LLM has no implicit affordance to 'trust' results otherwise,
   and these signals are how a human user would visually distinguish 'safe', well-trodden
   content. The boost is deliberately small — against :exact (100) and the :metabot context's
   :data-layer (33), text relevance still decides the ranking and these only break near-ties."
  {:official-collection 4
   :verified            5
   :view-count          3})

(defn- postprocess-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection official_collection data_authority curated data_layer can_write]
    :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        official? (boolean official_collection)
        collection-info (select-keys collection [:id :name :authority_level])
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
      ;; Curation signals beyond verified, so the LLM can see *why* content is curated:
      ;; `:curated` is the precomputed rollup (appdb/semantic engines only), `:data_layer` is
      ;; table-only. assoc-some (here and in the dashboard/metric branches) keeps them off results
      ;; that don't carry them (e.g. the in-place fallback).
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
          (m/assoc-some :curated curated
                        :can_write can_write))

      "document"
      (-> common-fields
          (merge {:official   official?
                  :collection collection-info})
          (m/assoc-some :curated curated
                        :can_write can_write))

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
             {:base_table_display_name (:table_display_name result)
              :database_id             (:database_id result)
              :base_table_id           (:table_id result)
              :base_table_name         (:table_name result)
              :base_table_schema       (:table_schema result)})

      ;; Questions, metrics, and datasets
      (-> common-fields
          (merge {:database_id (:database_id result)
                  :official    official?
                  :collection  collection-info})
          (m/assoc-some :curated curated
                        :display (:display result)
                        :moderated_status moderated_status)))))

(defn- enrich-with-collection-descriptions
  "Fetch and merge collection descriptions for all search results that have collection IDs."
  [results]
  (let [coll-ids     (->> results (keep #(get-in % [:collection :id])) distinct)
        descriptions (when (seq coll-ids)
                       (metabot.db/collection-descriptions coll-ids))]
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
                       (t2/hydrate (t2/select [:model/Collection :id :name :location :type] :id [:in direct-ids])
                                   :effective_location))
        id->eff-loc  (u/index-by :id :effective_location direct-rows)
        ;; Chase ancestors from the *raw* location so library-member detection (which reads the
        ;; root's :type, not its name) still works even when the root isn't readable. Only the
        ;; ancestor delta needs fetching — direct collections are already in hand.
        ancestor-delta   (->> direct-rows
                              (mapcat (comp ancestor-ids :location))
                              (remove (set direct-ids))
                              distinct)
        ancestor-rows    (when (seq ancestor-delta)
                           (t2/select [:model/Collection :id :name :location :type]
                                      :id [:in ancestor-delta]))
        id->row      (u/index-by :id (concat direct-rows ancestor-rows))
        path-of      (fn [coll-id]
                       (when-let [{:keys [name]} (get id->row coll-id)]
                         ;; Only readable ancestors (from :effective_location) contribute names,
                         ;; so we never leak the name of a collection the user can't see.
                         (let [ancestor-names (->> (ancestor-ids (get id->eff-loc coll-id))
                                                   (keep #(get-in id->row [% :name])))]
                           (str/join "/" (concat ancestor-names [name])))))
        library?     (premium-features/has-feature? :library)
        ;; A collection's root is its top-level ancestor, or itself when it's already top-level.
        ;; NOTE: the root is chased from the *raw* location, not `:effective_location`, so for a
        ;; readable item whose root ancestor is unreadable, `library_member` reflects that hidden
        ;; root's *type*. This is an accepted disclosure: it leaks one bit (library-type or not)
        ;; of type metadata about an already-visible item, never a name, and the flag is a
        ;; curation signal that must stay accurate even when the root isn't directly readable.
        root-type-of (fn [coll-id]
                       (let [root-id (or (first (ancestor-ids (get-in id->row [coll-id :location])))
                                         coll-id)]
                         (get-in id->row [root-id :type])))
        ;; A result is a library member when its root collection is a library type. Reuse the
        ;; canonical set the `:library` search scorer keys off of (see
        ;; `metabase.search.scoring/library-score-expr`) so the flag can't drift from the ranking.
        library-of   (fn [coll-id]
                       (boolean (and library?
                                     coll-id
                                     (collection/library-collection-types (root-type-of coll-id)))))]
    (mapv (fn [r]
            (let [cid  (result-collection-id r)
                  path (when cid (path-of cid))]
              (cond-> r
                path (assoc :collection_path path)
                (and path (collection-result? r)) (assoc :full_path path)
                ;; Only expose the premium `:library_member` signal when the feature is on,
                ;; matching [[enrich-tables-with-data-layer]] (which leaves the key absent
                ;; otherwise) so external /v1/search consumers see a consistent shape.
                (and library? cid) (assoc :library_member (library-of cid)))))
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
  result means the LLM doesn't need a separate `read_resource` round-trip just to learn
  the DB name."
  [results]
  (let [db-ids (->> results (keep :database_id) distinct)
        id->db (when (seq db-ids)
                 (metabot.db/database-engines-and-names db-ids))]
    (cond->> results
      (seq id->db) (mapv (fn [r]
                           (let [{engine :engine, db-name :name} (get id->db (:database_id r))]
                             (-> r
                                 (m/assoc-some :database_engine engine)
                                 (m/assoc-some :database_name db-name))))))))

(defn- enrich-with-portable-entity-ids
  "Attach `:portable_entity_id` (the entity's `entity_id` NanoID) to saved-question, model,
  metric, measure, and segment search results so the LLM can use it verbatim as
  `source-card:` (for questions/models) or inside a `[metric|measure|segment, {}, <eid>]`
  clause without a follow-up `read_resource` round-trip.

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
  an extra `read_resource` round-trip.

  - **Metrics** are Cards (saved questions of type `:metric`); the table id lives on
    `report_card.table_id`, so we look that up here and join through `metabase_table`.
    Base-table metadata is attached only when the current user can read that Table;
    collection access to the metric Card does not imply access to its physical source.
  - **Measures** and **segments** already carry the join'd table fields on the search
    row (see `:render-terms` + `:joins` in their search specs), so
    [[postprocess-search-result]] has already copied `:base_table_*` through and this
    step only needs to attach the portable FK.

  Requires `:database_name` to already be set (done by [[enrich-with-database-engines]])
  so we can assemble the full portable FK `[database_name, schema, table]`."
  [results]
  (let [metric-ids (->> results (filter #(= "metric" (:type %))) (keep :id) distinct)
        card-id->table-id (when (seq metric-ids)
                            (metabot.db/card-table-ids metric-ids))
        table-ids (->> card-id->table-id vals (remove nil?) distinct)
        table-id->info (when (seq table-ids)
                         (into {}
                               (comp (filter mi/can-read?)
                                     (map (juxt :id (juxt :schema :name))))
                               (t2/select [:model/Table :id :schema :name :db_id]
                                          :id [:in table-ids])))
        attach-portable-fk (fn [r]
                             (let [{:keys [database_name base_table_schema base_table_name]} r]
                               (cond-> r
                                 (and database_name base_table_name)
                                 (assoc :base_table_portable_fk
                                        [database_name base_table_schema base_table_name]))))]
    (mapv (fn [r]
            (cond
              (= "metric" (:type r))
              ;; Nothing is attached unless the Table survived the can-read? filter above — a
              ;; readable metric Card does not imply access to its physical source table.
              (let [table-id (get card-id->table-id (:id r))
                    [schema table-name] (when table-id (get table-id->info table-id))]
                (cond-> r
                  table-name (assoc :base_table_id table-id
                                    :base_table_name table-name
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
                       (->> (metabot.db/transforms transform-ids)
                            transforms/add-source-readable
                            (filter :source_readable)
                            (map :id)
                            set))]
    (cond->> results
      (seq transform-ids) (filterv (fn [result]
                                     (or (not= "transform" (:type result))
                                         (contains? readable-ids (:id result))))))))

(defn- validate-and-enrich-documents
  "Remove stale or unreadable document hits and attach live write permission. `archived?` is the
  archived state the search asked for: a hit is stale unless the live Document is in that set.

  Search indexes are updated asynchronously, so a deleted document can briefly remain
  searchable. Destination discovery must validate hits against the live model before the
  agent attempts to save into them."
  [archived? results]
  (let [document-ids (->> results (filter #(= "document" (:type %))) (map :id) set)
        id->document (when (seq document-ids)
                       (->> (metabot.db/documents-in-archived-state document-ids archived?)
                            (filter mi/can-read?)
                            (map (juxt :id identity))
                            (into {})))]
    (if (seq document-ids)
      (into []
            (keep (fn [result]
                    (if (= "document" (:type result))
                      (when-let [document (get id->document (:id result))]
                        (assoc result :can_write (boolean (mi/can-write? document))))
                      result)))
            results)
      results)))

(defn- search-result-id
  "Generate a unique identifier for a search result based on its id and model."
  [search-result]
  ((juxt :id :model) search-result))

(defn- reciprocal-rank-fusion
  "Combine multiple ranked search result lists using Reciprocal Rank Fusion (RRF).

  Takes a list of search result lists and combines them by:
  1. Calculating RRF scores for each item based on its rank in each list
  2. Summing scores for items that appear in multiple lists
  3. Returning items sorted by total RRF score (descending)

  The RRF score is calculated as: 1 / (k + r) where k defaults to 60 (typical RRF constant)"
  ([result-lists]
   (reciprocal-rank-fusion result-lists 60))
  ([result-lists k]
   ;; Remove empty result lists, as they're common, and can save a lot of work.
   (let [result-lists (keep seq result-lists)]
     (if (<= (count result-lists) 1)
       (first result-lists)
       (let [rrf-results (reduce
                          (fn [acc-map result-list]
                            (reduce-kv
                             (fn [acc rank search-result]
                               (let [id        (search-result-id search-result)
                                     rrf-score (/ 1.0 (+ k (inc rank)))]
                                 (if (contains? acc id)
                                   (update-in acc [id :rrf] + rrf-score)
                                   (assoc acc id {:search-result search-result
                                                  :rrf           rrf-score}))))
                             acc-map
                             (vec result-list)))
                          {}
                          result-lists)]
         (->> rrf-results
              vals
              (sort-by :rrf >)
              (map :search-result)))))))

(defn- join-results-by-rrf
  "Execute multiple search queries in parallel and combine results using Reciprocal Rank Fusion.
   Items appearing in multiple result lists are boosted in the final ranking.
   May return more results than requested limit."
  [search-fn search-engine all-queries]
  ;; Zero queries case is handled nicely by the >1 branch
  (if (= 1 (count all-queries))
    (search-fn (first all-queries) search-engine)
    ;; Create futures for parallel execution
    (let [futures      (mapv #(future (search-fn % search-engine)) all-queries)
          result-lists (mapv deref futures)]
      (reciprocal-rank-fusion result-lists))))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics, transforms) in Metabase.
  Abstracted from the API endpoint logic.

  Optional filter keys threaded straight into the search context: `created-by` (set of user ids),
  `archived`, `collection-id` (numeric, scopes to the collection subtree; overrides the metabot's
  own confined collection), `offset`. `filters-only?` makes a call with no queries run a single
  nil-query search — a pure listing over the active filters — instead of returning nothing.

  Each query fetches its full ranked pool (`ranked-results`), the pools are fused by rank, and the
  fused ranking is paginated (`offset`/`limit`) exactly once (`search-results`) — so paging a
  multi-query search is coherent. The result carries the size of the fused, deduped match set as
  `:total` metadata."
  [{:keys [term-queries semantic-queries database-id created-at last-edited-at
           entity-types limit metabot-id profile-id search-native-query weights
           created-by archived collection-id offset filters-only?]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:term-query-count     (count term-queries)
              :semantic-query-count (count semantic-queries)
              :database-id          database-id
              :entity-types         entity-types
              :limit                limit
              :metabot-id           metabot-id
              :profile-id           profile-id
              :search-native-query  search-native-query
              :weights              weights
              :created-by           created-by
              :archived             archived
              :collection-id        collection-id
              :offset               offset
              :filters-only?        filters-only?})
  (let [search-models   (if (seq entity-types)
                          (set (distinct (keep metabot.search-models/entity-type->search-model entity-types)))
                          metabot-search-models)
        _               (log/infof "[METABOT-SEARCH] Converted entity-types %s to search-models %s" entity-types search-models)
        metabot         (metabot.db/metabot-by-entity-id (get-in metabot.config/metabot-config [metabot-id :entity-id] metabot-id))
        use-verified?   (if metabot-id
                          (:use_verified_content metabot)
                          false)
        embedded-metabot?  (= metabot-id metabot.config/embedded-metabot-id)
        ;; A confined metabot (embedded, or the nlq profile) may only search inside its own
        ;; collection. That is a containment boundary, not a default, so a caller-supplied
        ;; collection-id — which the v2 search tool fills from a request filter — can never
        ;; replace it. Unconfined, the caller's collection-id applies.
        confined-id     (when (or embedded-metabot? (= profile-id "nlq"))
                          (:collection_id metabot))
        collection-id   (or confined-id collection-id)
        limit           (or limit 50)
        ranked-fn       (fn [search-string search-engine]
                          (let [search-context (search/search-context
                                                (cond-> {:search-string                       search-string
                                                         :models                              search-models
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
                                                         :archived                            (boolean archived)}
                                                  ;; Don't include search-native-query key if nil so that we don't
                                                  ;; inadvertently filter out search models that don't support it
                                                  search-native-query
                                                  (assoc :search-native-query (boolean search-native-query))
                                                  use-verified?
                                                  (assoc :curated true)
                                                  weights
                                                  (assoc :weights weights)
                                                  search-engine
                                                  (assoc :search-engine (name search-engine))
                                                  (seq created-by)
                                                  (assoc :created-by (set created-by))
                                                  collection-id
                                                  (assoc :collection collection-id)))
                                _              (log/infof "[METABOT-SEARCH] Search context models: %s"
                                                          (:models search-context))
                                ;; No :limit/:offset in the per-query context — ranked-results returns the
                                ;; full ranked pool; the fused ranking is paginated once, below. Applying
                                ;; offset per query before fusion would page the offset-N tail of each
                                ;; ranking, which is not the tail of the fused ranking.
                                ranked         (search/ranked-results search-context)]
                            (log/infof "[METABOT-SEARCH] Query returned entity types: %s"
                                       (frequencies (map :model ranked)))
                            ranked))
        ranked-fn*      (fn [search-engine queries]
                          (let [queries (search.engine/disjunction search-engine queries)]
                            (join-results-by-rrf ranked-fn search-engine queries)))
        ;; NOTE: if we add more semantic engines, e.g. 3rd party vector dbs, we'll need to make this more maintainable
        semantic?       #{:search.engine/semantic}
        semantic-engine (u/seek semantic? (search.engine/active-engines))
        fallback-engine (when semantic-engine
                          (search.engine/fallback-engine semantic-engine))
        fused-ranked    (cond
                          ;; A pure listing over the filters: one search with no search string.
                          (and filters-only?
                               (empty? term-queries)
                               (empty? semantic-queries))
                          (ranked-fn nil nil)

                          ;; Perform semantic and non-semantic search respectively, then fuse results.
                          semantic-engine
                          (reciprocal-rank-fusion
                           (map (fn [[engine queries]] (when (seq queries) (ranked-fn* engine queries)))
                                {semantic-engine semantic-queries
                                 fallback-engine term-queries}))

                          ;; Search for all the terms on equal footing, using the default engine.
                          :else
                          (ranked-fn* nil (distinct (concat term-queries semantic-queries))))
        ;; Paginate and hydrate the fused ranking exactly once. `search-results` slices to
        ;; [offset, offset+limit) and reports `:total` as the size of the full fused set — so the
        ;; total is knowable even under multi-query fusion, and only the returned page is hydrated.
        {:keys [data total]} (search/search-results
                              (search/search-context {:search-string      nil
                                                      :models             search-models
                                                      :current-user-id    api/*current-user-id*
                                                      :current-user-perms @api/*current-user-permissions-set*
                                                      :is-superuser?      api/*is-superuser?*
                                                      :offset             (or offset 0)
                                                      :limit              limit})
                              search/model-set
                              (vec fused-ranked))]
    ;; validate-and-enrich-documents drops stale/unreadable document hits and attaches live write
    ;; permission. Transforms need no such post-filter: they are :visibility :superuser in search, so
    ;; a non-superuser never has one in results to begin with.
    (-> (->> data
             (map postprocess-search-result)
             enrich-with-collection-descriptions
             enrich-with-database-engines
             enrich-with-portable-entity-ids
             enrich-with-base-tables
             (validate-and-enrich-documents (boolean archived)))
        (vary-meta assoc :total total))))

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
                      ;; Strip clinging edge punctuation so "sales, revenue" broadens to
                      ;; "sales or revenue", not "sales, or revenue". This also drops a leading
                      ;; `-` (negation): the OR-broadening fallback deliberately ignores exclusion
                      ;; intent — keyword negation is already documented as unreliable, and on a
                      ;; zero-hit last resort surfacing "-refunds" as "refunds" beats nothing.
                      (map #(str/replace % #"^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$" ""))
                      (remove str/blank?)
                      (remove #(query-broadening-stopwords (u/lower-case-en %))))]
      (when (> (count tokens) 1)
        (str/join " or " tokens)))))

(defn search-by-query
  "Search for data sources (tables, models, cards, dashboards, metrics, measures,
   segments, transforms) in Metabase with a single query string. This is the Metabot tools' search.

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
             {:database-id         database-id
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
        metabot         (metabot.db/metabot-by-entity-id (get-in metabot.config/metabot-config [metabot-id :entity-id] metabot-id))
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
        ;; Zero-hit fallback is Postgres-appdb-only. The `or`-rewrite relies on Postgres
        ;; tsquery semantics, where lowercase `or` compiles to `|`. It does NOT hold for:
        ;;   - the semantic engine, which already fuses keyword + vector matching (redundant);
        ;;   - the `in-place` engine, whose LIKE-pattern matching has no `|` notion;
        ;;   - appdb on H2, whose specialization ANDs whitespace-split tokens as LIKE patterns
        ;;     (see `metabase.search.appdb.specialization.h2/wildcard-tokens`) — there the
        ;;     `or`-joined query is strictly *narrower*, the opposite of broadening.
        ;; So we gate on appdb AND a Postgres app-db backend.
        results         (or (when (and (empty? primary)
                                       (= picked-engine :search.engine/appdb)
                                       (= :postgres (mdb/db-type)))
                              (when-let [broadened (broaden-query query)]
                                (log/info "[METABOT-SEARCH] Zero hits; retrying with an OR-broadened query")
                                (not-empty (run-engine broadened))))
                            primary)]
    (log/infof "[METABOT-SEARCH] Query returned entity types: %s" (frequencies (map :model results)))
    (->> results
         (take limit)
         (map postprocess-search-result)
         enrich-with-collection-descriptions
         enrich-with-collection-paths
         enrich-tables-with-data-layer
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-base-tables
         (validate-and-enrich-documents false)
         remove-unreadable-transforms)))

(defn- table-refs->results
  [ids]
  (when (seq ids)
    ;; only surface tables the current user can read — a curated entry may point at one they can't access
    (for [t (filter mi/can-read?
                    (metabot.db/table-summaries ids))]
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
                                  (metabot.db/card-search-rows ids))))
        coll-ids  (->> (vals id->card) (keep :collection_id) distinct)
        id->coll  (when (seq coll-ids)
                    (into {} (map (juxt :id identity))
                          (metabot.db/collection-summaries coll-ids)))
        ;; verified is already a set (t2/select-fn-set), possibly nil when there were no ids
        verified  (when (seq ids)
                    (metabot.db/verified-item-ids ids "card"))]
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
          fetch   (fn [db-fn ids]
                    (when-let [ids (not-empty (distinct ids))]
                      (filter mi/can-read? (db-fn ids))))
          rows    (concat (map #(assoc % :type "measure") (fetch metabot.db/measures (map :id (get by-type "measure"))))
                          (map #(assoc % :type "segment") (fetch metabot.db/segments (map :id (get by-type "segment")))))
          tbl-ids (not-empty (distinct (keep :table_id rows)))
          id->tbl (when tbl-ids
                    (into {} (map (juxt :id identity))
                          (metabot.db/table-schema-rows tbl-ids)))]
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
  [[metabase.metabot.tools.shared.llm-shape/search-result->xml]] and the `search` tool consume.

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

;; Field-level descriptions surface to the model as JSON-Schema `description`s on the
;; tool's input parameters (via `malli.json-schema` in `metabase.metabot.self.claude`).
;; Query-writing guidance lives in the system prompt's discovery section, not here.
(def ^:private entity-types-desc
  "Restrict results to these entity types. Omit to search across all types this tool supports.")

(def ^:private limit-desc
  (str "Maximum number of results (default " default-search-limit ", max " max-search-limit "). "
       "Use a larger value for broad or generic queries; keep the default for narrow, specific ones."))

(defn- entity-types-schema
  [& types]
  [:maybe [:sequential {:error/message "must be an array of supported entity type strings"}
           (into [:enum {:description entity-types-desc}] types)]])

(def ^:private limit-schema
  [:maybe [:int {:min 1 :max max-search-limit :description limit-desc}]])

(defn- search-result->item
  "Trim a search result to the fields the chain-of-thought results card renders.
  `:display` (a question's viz type) and `:moderated_status` let the client pick the
  exact entity icon, matching the app's search/command-palette icons."
  [r]
  (-> (select-keys r [:id :type :name :display_name :database_id :database_schema :database_name])
      (m/assoc-some :display (some-> (:display r) name)
                    :moderated_status (:moderated_status r)
                    :collection (some-> (:collection r) (select-keys [:id :name])))))

(defn- do-search
  [label allowed-types search-opts {:keys [query entity_types limit
                                           database_id collection_id]
                                    :as _args}]
  (if-let [invalid (invalid-entity-types entity_types allowed-types)]
    {:output (str "Invalid entity_types for " label ": " (pr-str (vec invalid))
                  ". Allowed types: " (str/join ", " allowed-types) ".")}
    (let [results (search-by-query (merge {:query        query
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
                             :total_count (count results)}
         :data-parts [(streaming/search-results-part
                       {:total_count (count results)
                        :results (mapv search-result->item results)})]})))

(def ^:private search-schema
  [:map {:closed true}
   [:query ms/NonBlankString]
   [:entity_types {:optional true}
    (entity-types-schema "table" "model" "metric" "measure" "segment"
                         "dashboard" "document" "question" "collection")]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe :int]]
   [:limit {:optional true} limit-schema]])

(defn- search-display
  [{:keys [query]}]
  ;; just the object (the query) — the client wraps it in the verb + tense
  ;; ("Searching for …" while active, "Searched for …" once finished). The title runs before argument
  ;; validation, so a malformed query yields no title rather than an error.
  (when (string? query)
    (not-empty query)))

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search
           :title-fn  search-display}
  search-tool
  "Search for tables, models, metrics, measures, segments, dashboards, documents, saved questions, and collections."
  [args :- search-schema]
  (do-search "search"
             (sorted-set "collection" "dashboard" "document" "measure" "metric" "model"
                         "question" "segment" "table")
             {} args))

(def ^:private sql-search-schema
  [:map {:closed true}
   [:query ms/NonBlankString]
   [:database_id :int]
   [:entity_types {:optional true} (entity-types-schema "table" "model")]
   [:limit {:optional true} limit-schema]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search
           :title-fn  search-display}
  sql-search-tool
  "Search for SQL-queryable data sources (tables and models) within a database."
  [{:keys [database_id] :as args} :- sql-search-schema]
  (do-search "SQL search" (sorted-set "model" "table") {:database-id database_id} args))

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:query ms/NonBlankString]
   [:entity_types {:optional true}
    (entity-types-schema "table" "model" "metric" "measure" "segment"
                         "question" "collection" "dashboard" "document")]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe :int]]
   [:limit {:optional true} limit-schema]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search
           :title-fn  search-display}
  nlq-search-tool
  "Search for NLQ-queryable data sources (tables, models, metrics, measures, segments, questions, and
  collections), or find dashboards and documents as save destinations."
  [{:keys [entity_types] :as args} :- nlq-search-schema]
  (let [allowed-types (sorted-set "collection" "dashboard" "document" "measure" "metric" "model"
                                  "question" "segment" "table")
        args          (cond-> args
                        (not (seq entity_types))
                        (assoc :entity_types ["collection" "measure" "metric" "model" "question"
                                              "segment" "table"]))]
    (do-search "NLQ search" allowed-types {:profile-id "nlq"} args)))

(def ^:private transform-search-schema
  [:map {:closed true}
   [:query ms/NonBlankString]
   [:search_native_query {:optional true} [:maybe :boolean]]
   [:entity_types {:optional true} (entity-types-schema "table" "model" "transform")]
   [:limit {:optional true} limit-schema]])

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search
           :title-fn  search-display}
  transform-search-tool
  "Search for transforms, tables, and models."
  [{:keys [search_native_query] :as args} :- transform-search-schema]
  (do-search "transform search" (sorted-set "model" "table" "transform")
             {:search-native-query search_native_query} args))
