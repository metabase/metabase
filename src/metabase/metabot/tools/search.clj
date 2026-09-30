(ns metabase.metabot.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
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
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private metabot-search-models
  (sorted-set "card" "collection" "dashboard" "database" "dataset" "document"
              "measure" "metric" "segment" "table" "transform"))

(defn- postprocess-search-result
  "Transform a single search result to match the appropriate entity-specific schema."
  [{:keys [verified moderated_status collection collection_authority_level data_authority curated data_layer can_write]
    :as result}]
  (let [model (:model result)
        verified? (or (boolean verified) (= moderated_status "verified"))
        ;; `collection_authority_level` is the only authority signal every model carries: on a card /
        ;; dashboard / document row it's the *parent* collection's level, and on a collection row it's
        ;; the collection's own. Don't read `official_collection` (cards and dashboards define it, but
        ;; collections and documents don't) and don't read the nested `:collection` map either —
        ;; `search.impl/serialize` overwrites that with the *effective parent* for collection rows, so
        ;; it answers a different question and arrives keywordized. `name` because the index column is
        ;; a string but the hydrated parent is a keyword.
        authority-level (some-> collection_authority_level name)
        official? (= "official" authority-level)
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
      ;; queries directly. For a collection row `authority-level` is the collection's own level, so
      ;; here `:official` means "this collection is official" rather than "it sits in one".
      ;;
      ;; The set of container types also lives in `llm-shape/container-type?`, which decides the
      ;; rendered `is_container` attribute — add a new container type to both or neither.
      (-> common-fields
          (merge {:official        official?
                  :is_container    true})
          (m/assoc-some :authority_level authority-level
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
          ;; A *published* table lives in a collection — often a library one (the table spec joins
          ;; Collection on `is_published`). Carry it like any other collection-bearing result so the
          ;; table picks up `collection_path` and `library_member`.
          ;;
          ;; Both halves of the test earn their keep. A table published at the *root* has no
          ;; collection row, and the spec coalesces a display name for it, which makes
          ;; `search.impl/serialize` stamp the id as the string "root" — feeding that to a numeric
          ;; `:id [:in ...]` lookup downstream fails the whole search. And an *unpublished* table can
          ;; still carry a stale numeric `collection_id`, but its collection join is gated on
          ;; `is_published`, so the name comes back nil and we must not claim it lives there.
          (m/assoc-some :curated curated
                        :data_layer data_layer
                        :collection (when (and (int? (:id collection)) (:name collection))
                                      collection-info)))

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
  "The collection id this result lives in (or, for collection results, the collection's own id).

  Only real numeric ids: `search.impl/serialize` uses the string \"root\" to mean \"published at the
  root\", and every caller here feeds this straight into a numeric `:id [:in ...]` lookup."
  [r]
  (let [id (if (collection-result? r) (:id r) (get-in r [:collection :id]))]
    (when (int? id) id)))

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
   collection. Published tables have a collection too, so they route through here like anything else.
   A table's `data_layer` plays no part: upgraded instances put nearly every visible table on `:final`."
  [results]
  (let [direct-ids   (->> results (keep result-collection-id) distinct)
        ;; Bulk-fetch direct collections (with their effective location, which elides ancestors
        ;; the current user can't read) so we can chase ancestors permission-safely.
        direct-rows  (when (seq direct-ids)
                       (metabot.db/collection-path-rows-with-effective-location direct-ids))
        id->eff-loc  (u/index-by :id :effective_location direct-rows)
        ;; Chase ancestors from the *raw* location so library-member detection (which reads the
        ;; root's :type, not its name) still works even when the root isn't readable. Only the
        ;; ancestor delta needs fetching — direct collections are already in hand.
        ancestor-delta   (->> direct-rows
                              (mapcat (comp ancestor-ids :location))
                              (remove (set direct-ids))
                              distinct)
        ancestor-rows    (when (seq ancestor-delta)
                           (metabot.db/collection-path-rows ancestor-delta))
        id->row      (u/index-by :id (concat direct-rows ancestor-rows))
        ;; A table (and so a measure/segment bound to it) is reachable through *data* permissions,
        ;; which say nothing about its collection. Everything name-shaped is gated on reading that
        ;; collection; only the root's `:type` survives below, per the disclosure note there.
        readable-ids (into #{} (comp (filter mi/can-read?) (map :id)) direct-rows)
        path-of      (fn [coll-id]
                       (when-let [{:keys [name]} (and (readable-ids coll-id) (get id->row coll-id))]
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
                ;; drop the whole nested map when its collection is unreadable: it carries the name,
                ;; and `enrich-with-collection-descriptions` may already have added the description
                (and cid (not (readable-ids cid)) (not (collection-result? r)))
                (dissoc :collection)

                path (assoc :collection_path path)
                (and path (collection-result? r)) (assoc :full_path path)
                ;; Only expose the premium `:library_member` signal when the feature is on, leaving the
                ;; key absent otherwise so external /v1/search consumers see a consistent shape.
                (and library? cid) (assoc :library_member (library-of cid)))))
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
        type->rows  {"measure" metabot.db/measures
                     "segment" metabot.db/segments}
        card-ids    (->> results (filter #(card-types (:type %))) (keep :id) distinct)
        card-id->eid (when (seq card-ids)
                       (metabot.db/card-entity-ids card-ids))
        other-eid-lookups (into {}
                                (map (fn [[type rows-fn]]
                                       (let [ids (->> results (filter #(= type (:type %))) (keep :id) distinct)]
                                         (when (seq ids)
                                           [type (u/index-by :id :entity_id (rows-fn ids))]))))
                                type->rows)]
    (mapv (fn [r]
            (let [eid (cond
                        (card-types (:type r)) (get card-id->eid (:id r))
                        (contains? type->rows (:type r))
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
        ;; Measures and segments already carry their binding table's id from the search row; metrics
        ;; need the extra Card lookup above. Resolve both families in one Table query.
        bound-table-ids (->> results
                             (filter #(#{"measure" "segment"} (:type %)))
                             (keep :base_table_id))
        table-ids (->> (concat (vals card-id->table-id) bound-table-ids)
                       (remove nil?)
                       distinct)
        table-rows (when (seq table-ids)
                     (filter mi/can-read?
                             (metabot.db/table-publication-rows table-ids)))
        table-id->info (into {} (map (juxt :id (juxt :schema :name))) table-rows)
        ;; A measure or segment inherits its binding table's collection, so one published into the
        ;; Library carries `library_member` like the table does. Deliberately wider than
        ;; `search.scoring/library-score-expr`, which scores these 0 because their spec sets
        ;; `:collection-id false` and so leaves no root collection to key off. The flag answers "is
        ;; this governed content the agent can trust", which the binding table settles.
        table-id->collection (into {}
                                   (keep (fn [{:keys [id collection_id is_published]}]
                                           (when (and is_published collection_id)
                                             [id {:id collection_id}])))
                                   table-rows)
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
              ;; Table fields were already copied through by postprocess-search-result; attach the
              ;; portable FK now that database_name is known, plus the binding table's collection so
              ;; `enrich-with-collection-paths` can stamp library membership.
              (-> (attach-portable-fk r)
                  (m/assoc-some :collection (get table-id->collection (:base_table_id r))))

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

(defn- scoped-collection-id
  "The collection a search is limited to. A confined metabot (embedded, or the nlq profile) keeps every search
  inside its configured collection: a caller-supplied collection narrows the scope only when it is the configured
  one or lies beneath it, and is ignored otherwise. Unconfined, the caller's collection applies as given."
  [caller-id configured-id]
  (cond
    (nil? configured-id)        caller-id
    (nil? caller-id)            configured-id
    (= caller-id configured-id) caller-id

    (some-> (:location (metabot.db/collection caller-id))
            (str/includes? (str "/" configured-id "/")))
    caller-id

    :else
    (do (log/infof "[METABOT-SEARCH] Collection %s is outside the configured collection %s; searching %s"
                   caller-id configured-id configured-id)
        configured-id)))

(defn search
  "Search for data sources (tables, models, cards, dashboards, metrics, transforms) in Metabase.
  Abstracted from the API endpoint logic.

  Optional filter keys threaded straight into the search context: `created-by` (set of user ids),
  `archived`, `collection-id` (numeric, scopes to the collection subtree; see [[scoped-collection-id]]
  for how it combines with a confined metabot's own collection), `offset`. `filters-only?` makes a call with no queries run a single
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
        ;; A confined metabot (embedded, or the nlq profile) may only search inside its own collection.
        ;; That is a containment boundary, not a default: a caller-supplied collection-id — which the v2
        ;; search tool fills from a request filter — can narrow the search within it but never widen it.
        collection-id   (scoped-collection-id collection-id
                                              (when (or embedded-metabot? (= profile-id "nlq"))
                                                (:collection_id metabot)))
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

;; TODO (Chris 2026-09-30) -- Two search entry points have diverged. [[search]] is the multi-query search (term and
;; semantic queries, fused by rank, paginated) behind MCP v2's `search` tool and `/v1/search`. [[search-by-query]] is
;; the single-query search the Metabot tools use, which pins one engine per call and enriches results further. We may
;; want to consolidate them once it's clear which shape both callers should share.
(defn search-by-query
  "The Metabot search tools' search: one query, run on one engine, with results shaped and enriched for the model.

  `engine` is the engine to run, by default the keyword engine. `query` is a plain string, such as a natural-language
  description for the semantic engine. `search-expr` is a structured keyword query (see `metabase.search.query-expr`):
  engines that compile it match on it, and the others match its leaves as a plain string. `vector-only?` asks the
  semantic engine for meaning alone."
  [{:keys [query search-expr engine vector-only? database-id collection-id created-at last-edited-at
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
        collection-id   (scoped-collection-id collection-id
                                              (when (or embedded-metabot? (= profile-id "nlq"))
                                                (:collection_id metabot)))
        limit           (or limit 50)
        picked-engine   (or engine (search.engine/keyword-engine))
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
                                          :offset                              0
                                          :weights                             weights}
                                   ;; Don't include search-native-query key if nil so that we don't
                                   ;; inadvertently filter out search models that don't support it
                                   search-native-query (assoc :search-native-query (boolean search-native-query))
                                   use-verified?       (assoc :curated true)
                                   collection-id       (assoc :collection collection-id)
                                   search-expr         (assoc :search-expr search-expr)
                                   vector-only?        (assoc :vector-only? true)))]
                            (:data (search/search search-context))))
        results         (run-engine (if search-expr (search/query-expr-search-string search-expr) query))]
    (log/info "[METABOT-SEARCH] Search finished" {:engine       picked-engine
                                                  :query-shape  (if search-expr :expression :string)
                                                  :result-count (count results)
                                                  :entity-types (frequencies (map :model results))})
    (->> results
         (take limit)
         (map postprocess-search-result)
         enrich-with-collection-descriptions
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-base-tables
         ;; after base tables: that step resolves a measure/segment's binding collection
         enrich-with-collection-paths
         (validate-and-enrich-documents false)
         remove-unreadable-transforms)))

(defn- table-refs->results
  [ids]
  (when (seq ids)
    ;; only surface tables the current user can read — a curated entry may point at one they can't access
    (for [t (filter mi/can-read?
                    (metabot.db/table-summaries-with-publication ids))]
      (cond-> {:id              (:id t)
               :type            "table"
               :name            (:name t)
               :display_name    (:display_name t)
               :database_id     (:db_id t)
               :database_schema (:schema t)
               :description     (:description t)}
        ;; Carry the collection so `enrich-with-collection-paths` reaches these too — otherwise the
        ;; same library table reports `library_member` true through `search` and false through this
        ;; path. Gated on `is_published` for the same reason the search path is: an unpublished table
        ;; can still hold a stale `collection_id` it isn't really published into.
        (and (:is_published t) (:collection_id t))
        (assoc :collection {:id (:collection_id t)})))))

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
    ;; Same enrichment chain as [[search]] minus `remove-unreadable-transforms`, which can't fire —
    ;; there is no transform branch above, so a transform ref never reaches here. The collection-path
    ;; step does run: both paths render through
    ;; [[metabase.metabot.tools.shared.llm-shape/search-result->xml]], and omitting it would drop
    ;; `is_library_member` — which the result instructions call the strongest curation signal — from
    ;; exactly the entities most likely to have it.
    (->> (concat (table-refs->results table-ids)
                 (card-refs->results (distinct card-refs))
                 (measure-segment-refs->results (distinct ms-refs)))
         enrich-with-collection-descriptions
         enrich-with-database-engines
         enrich-with-portable-entity-ids
         enrich-with-base-tables
         ;; after base tables: that step resolves a measure/segment's binding collection
         enrich-with-collection-paths)))

(defn- format-search-output
  "Format search results as an LLM-ready string. One XML element per result so the agent
   can clearly see the type, attributes, and curation tags for each hit. The agent picks
   URIs and feeds them to read_resource for details."
  [query results]
  (let [results-xml (str/join "\n" (map llm-shape/search-result->xml results))]
    (te/lines
     (str "<results query=\"" (llm-shape/escape-xml query)
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
  (str "Maximum number of results (default " default-search-limit ", max " max-search-limit ")."))

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
    (let [results (search-by-query (merge {:query        (when (string? query) query)
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
      {:output (format-search-output (if (string? query) query (json/encode query)) results)
       :structured-output {:result-type :search
                           :data results
                           :total_count (count results)}
       :data-parts [(streaming/search-results-part
                     {:total_count (count results)
                      :results (mapv search-result->item results)})]})))

;;; ------------------------------------------------ The search tools ------------------------------------------------
;;
;; One tool per matcher, named for how it matches, because a query is written for a matcher: `cust` is a good
;; substring query and a useless full-text one. `semantic_search` matches meaning. `fulltext_search` (app-db on
;; Postgres) and `substring_search` (in-place, or app-db on H2) take a structured query whose schema lists only the
;; operators that engine runs, so nothing the model can send is silently reinterpreted. Each tool is advertised only
;; while its engine serves this instance (`:available?`), and each profile gets variants that carry its own entity
;; types and scope arguments.

(defn- semantic-available? [_ctx] (= :ok (search.engine/engine-status :search.engine/semantic)))
(defn- fulltext-available? [_ctx] (= :fulltext (search.engine/keyword-flavour)))
(defn- substring-or-available? [_ctx] (= :substring-or (search.engine/keyword-flavour)))
(defn- substring-and-available? [_ctx] (= :substring-and (search.engine/keyword-flavour)))

(defn- semantic-unavailable-note
  "What the prompt says about `semantic_search` when it isn't offered. Nothing here is sensitive: it names the kind of
  thing that is missing, never configuration details."
  [_ctx]
  {:purpose    "finds data by what it means, even when its name and description use different words"
   :missing    "matching by meaning, so synonyms and paraphrases only match when they share words"
   :reason     (if (= :unsupported (search.engine/engine-status :search.engine/semantic))
                 "semantic search isn't available on this instance"
                 "semantic search isn't set up on this instance")
   :workaround "search for the likely words, and give synonyms as `or` alternatives where the search tool allows"})

(def ^:private semantic-query-schema
  [:string {:min         1
            :description (str "What you're looking for, described in plain words. Write a short description of the "
                              "data, not keywords or operators.")}])

(defn- keyword-query-schema
  [ops description]
  (mut/update-properties (search/query-expr-schema ops) assoc :description description))

(def ^:private fulltext-query-schema
  (keyword-query-schema
   #{"and" "or" "not" "phrase" "prefix"}
   (str "The words to match in names and descriptions: one term, or a tree of `and`, `or` and `not` nodes over "
        "terms, `phrase`s and `prefix`es. Terms match whole words after stemming, so `orders` finds `order` but "
        "`cust` finds nothing unless it is a `prefix`. Very common words such as `the` match nothing.")))

(def ^:private substring-or-query-schema
  (keyword-query-schema
   #{"or"}
   (str "Text to find in names and descriptions: one term, or an `or` of terms of which any may match. A term "
        "matches anywhere inside a word, so `cust` finds `customers`.")))

(def ^:private substring-and-query-schema
  (keyword-query-schema
   #{"and"}
   (str "Text to find in names and descriptions: one term, or an `and` of terms that must all appear. A term "
        "matches anywhere inside a word, so `cust` finds `customers`.")))

(def ^:private matchers
  "How each matcher runs: the engine it pins, and whether its `query` is a structured query."
  {:semantic      {:engine (constantly :search.engine/semantic) :expr? false :vector-only? true}
   :fulltext      {:engine search.engine/keyword-engine :expr? true :validate-tsquery? true}
   :substring-or  {:engine search.engine/keyword-engine :expr? true}
   :substring-and {:engine search.engine/keyword-engine :expr? true}})

(def ^:private general-types
  (sorted-set "collection" "dashboard" "document" "measure" "metric" "model" "question" "segment" "table"))

(def ^:private profiles
  "Each profile's variant: the entity types it allows, its defaults, and the extra search options it sets."
  {:general {:label "search", :allowed general-types}
   :sql     {:label "SQL search", :allowed (sorted-set "model" "table")}
   :nlq     {:label         "NLQ search"
             :allowed       general-types
             :default-types ["collection" "measure" "metric" "model" "question" "segment" "table"]
             :opts          {:profile-id "nlq"}}})

(defn- tool-schema
  [profile query-schema]
  (case profile
    :general [:map {:closed true}
              [:query query-schema]
              [:entity_types {:optional true} (apply entity-types-schema general-types)]
              [:database_id   {:optional true} [:maybe :int]]
              [:collection_id {:optional true} [:maybe :int]]
              [:limit {:optional true} limit-schema]]
    :sql     [:map {:closed true}
              [:query query-schema]
              [:database_id :int]
              [:entity_types {:optional true} (entity-types-schema "table" "model")]
              [:limit {:optional true} limit-schema]]
    :nlq     [:map {:closed true}
              [:query query-schema]
              [:entity_types {:optional true} (apply entity-types-schema general-types)]
              [:database_id   {:optional true} [:maybe :int]]
              [:collection_id {:optional true} [:maybe :int]]
              [:limit {:optional true} limit-schema]]))

(defn- tool-error
  [message]
  (ex-info message {:agent-error? true}))

(defn- validate-keyword-query!
  "Reject a structured query the engine would run in a way the model didn't mean: too many leaves, and on Postgres,
  leaves that normalize to nothing or a query that can't restrict the index."
  [matcher expr]
  (when-let [error (search/query-expr-limit-error expr)]
    (throw (tool-error error)))
  (when (:validate-tsquery? (matchers matcher))
    (let [{:keys [empty-leaves unrestricted?]} (search/query-expr-problems expr)]
      (when (seq empty-leaves)
        (throw (tool-error (str (str/join ", " (map #(str "`" % "`") empty-leaves))
                                " can't match anything: full-text search drops very common words such as `the` "
                                "and `and`. Remove it, or use a more specific word."))))
      (when unrestricted?
        (throw (tool-error (str "This query would match almost everything: a `not` inside an `or` excludes one "
                                "thing from everything else. Put each `not` inside an `and` with a term that "
                                "has to match.")))))))

(defn- run-search-tool
  [profile matcher {:keys [query entity_types] :as args}]
  (let [{:keys [label allowed default-types opts]} (profiles profile)
        {:keys [engine expr? vector-only?]}        (matchers matcher)
        args                                       (cond-> args
                                                     (and default-types (not (seq entity_types)))
                                                     (assoc :entity_types default-types))]
    (when expr?
      (validate-keyword-query! matcher query))
    (try
      (do-search label allowed
                 (merge opts
                        {:engine (engine)}
                        (when vector-only? {:vector-only? true})
                        (when expr? {:search-expr query})
                        (when (= :sql profile) {:database-id (:database_id args)}))
                 args)
      (catch clojure.lang.ExceptionInfo e
        ;; vector-only search doesn't fall back to a keyword engine; point the model at the keyword tool instead
        (if (= :semantic-search-error (:type (ex-data e)))
          (throw (tool-error (str "Semantic search isn't working right now. Use `"
                                  (if (fulltext-available? nil) "fulltext_search" "substring_search")
                                  "` instead, with the likely words.")))
          (throw e))))))

(defn- search-display
  [{:keys [query]}]
  ;; just the object (the query) — the client wraps it in the verb + tense
  ;; ("Searching for …" while active, "Searched for …" once finished). The title runs before argument
  ;; validation, so a malformed query yields no title rather than an error.
  (cond
    (string? query) (not-empty query)
    (map? query)    (u/ignore-exceptions (not-empty (search/query-expr-search-string query)))))

;;; general profiles (internal, Slackbot, Explorations)

(mu/defn ^{:tool-name        "semantic_search"
           :scope            scope/agent-search
           :title-fn         search-display
           :available?       semantic-available?
           :unavailable-note semantic-unavailable-note
           :replaces         #{"search"}}
  semantic-search-tool
  "Find data and content by meaning: describe what you want in plain words, and it finds matches even when their
  names use different words. It returns only close matches, so pair it with the keyword search tool, which also
  finds exact names and codes and can exclude things. Searches tables, models, metrics, measures, segments,
  dashboards, documents, saved questions, and collections."
  [args :- (tool-schema :general semantic-query-schema)]
  (run-search-tool :general :semantic args))

(mu/defn ^{:tool-name  "fulltext_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? fulltext-available?
           :replaces   #{"search"}}
  fulltext-search-tool
  "Find data and content by the words in its name and description. Matches whole words (stemmed), and combines
  terms with `and`, `or` and `not`, `phrase`s and `prefix`es. Use it for the distinctive words of what you want,
  exact names and codes, and exclusions. Searches tables, models, metrics, measures, segments, dashboards,
  documents, saved questions, and collections."
  [args :- (tool-schema :general fulltext-query-schema)]
  (run-search-tool :general :fulltext args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-or-available?
           :replaces   #{"search"}}
  substring-or-search-tool
  "Find data and content whose name or description contains the given text. Give alternatives with `or`. Searches
  tables, models, metrics, measures, segments, dashboards, documents, saved questions, and collections."
  [args :- (tool-schema :general substring-or-query-schema)]
  (run-search-tool :general :substring-or args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-and-available?
           :replaces   #{"search"}}
  substring-and-search-tool
  "Find data and content whose name or description contains the given text. Require several terms with `and`.
  Searches tables, models, metrics, measures, segments, dashboards, documents, saved questions, and collections."
  [args :- (tool-schema :general substring-and-query-schema)]
  (run-search-tool :general :substring-and args))

;;; SQL profile: tables and models in the database the user has open

(mu/defn ^{:tool-name        "semantic_search"
           :scope            scope/agent-search
           :title-fn         search-display
           :available?       semantic-available?
           :unavailable-note semantic-unavailable-note
           :replaces         #{"search"}}
  sql-semantic-search-tool
  "Find SQL-queryable tables and models in a database by meaning: describe what you want in plain words. Use it for
  concepts; use the keyword search tool for exact table names."
  [args :- (tool-schema :sql semantic-query-schema)]
  (run-search-tool :sql :semantic args))

(mu/defn ^{:tool-name  "fulltext_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? fulltext-available?
           :replaces   #{"search"}}
  sql-fulltext-search-tool
  "Find SQL-queryable tables and models in a database by the words in their names and descriptions. Matches whole
  words (stemmed), and combines terms with `and`, `or` and `not`, `phrase`s and `prefix`es."
  [args :- (tool-schema :sql fulltext-query-schema)]
  (run-search-tool :sql :fulltext args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-or-available?
           :replaces   #{"search"}}
  sql-substring-or-search-tool
  "Find SQL-queryable tables and models in a database whose name or description contains the given text. Give
  alternatives with `or`."
  [args :- (tool-schema :sql substring-or-query-schema)]
  (run-search-tool :sql :substring-or args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-and-available?
           :replaces   #{"search"}}
  sql-substring-and-search-tool
  "Find SQL-queryable tables and models in a database whose name or description contains the given text. Require
  several terms with `and`."
  [args :- (tool-schema :sql substring-and-query-schema)]
  (run-search-tool :sql :substring-and args))

;;; NLQ profiles (NLQ, embedded): queryable data by default, dashboards and documents as save destinations

(mu/defn ^{:tool-name        "semantic_search"
           :scope            scope/agent-search
           :title-fn         search-display
           :available?       semantic-available?
           :unavailable-note semantic-unavailable-note
           :replaces         #{"search"}}
  nlq-semantic-search-tool
  "Find data to answer a question by meaning: describe what you want in plain words, and it finds tables, models,
  metrics, measures, segments, questions, and collections even when their names use different words. Can also find
  dashboards and documents as save destinations."
  [args :- (tool-schema :nlq semantic-query-schema)]
  (run-search-tool :nlq :semantic args))

(mu/defn ^{:tool-name  "fulltext_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? fulltext-available?
           :replaces   #{"search"}}
  nlq-fulltext-search-tool
  "Find data to answer a question by the words in its name and description: tables, models, metrics, measures,
  segments, questions, and collections, or dashboards and documents as save destinations. Matches whole words
  (stemmed), and combines terms with `and`, `or` and `not`, `phrase`s and `prefix`es."
  [args :- (tool-schema :nlq fulltext-query-schema)]
  (run-search-tool :nlq :fulltext args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-or-available?
           :replaces   #{"search"}}
  nlq-substring-or-search-tool
  "Find data to answer a question whose name or description contains the given text: tables, models, metrics,
  measures, segments, questions, and collections, or dashboards and documents as save destinations. Give
  alternatives with `or`."
  [args :- (tool-schema :nlq substring-or-query-schema)]
  (run-search-tool :nlq :substring-or args))

(mu/defn ^{:tool-name  "substring_search"
           :scope      scope/agent-search
           :title-fn   search-display
           :available? substring-and-available?
           :replaces   #{"search"}}
  nlq-substring-and-search-tool
  "Find data to answer a question whose name or description contains the given text: tables, models, metrics,
  measures, segments, questions, and collections, or dashboards and documents as save destinations. Require
  several terms with `and`."
  [args :- (tool-schema :nlq substring-and-query-schema)]
  (run-search-tool :nlq :substring-and args))
