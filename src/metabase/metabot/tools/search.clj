(ns metabase.metabot.tools.search
  "Search tool wrappers for Metabot v3."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.search-models :as metabot.search-models]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

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

      ("measure" "segment")
      ;; Measures and segments belong to a table, not a collection, so they carry the base table from the index row.
      ;; Their `:portable_entity_id` comes later, from [[enrich-with-portable-entity-ids]].
      (-> common-fields
          (merge {:database_id       (:database_id result)
                  :base_table_id     (:table_id result)
                  :base_table_name   (:table_name result)
                  :base_table_schema (:table_schema result)})
          (m/assoc-some :curated                 curated
                        :base_table_display_name (:table_display_name result)))

      "transform"
      (merge common-fields
             {:database_id (:database_id result)})

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
  "The ids in a Collection :location string like \"/12/34/\", or nil when there is none."
  [location]
  (some-> location collection/location-path->ids))

(defn- readable-collection-ids
  "The ids of the Collection `rows` the current user can read."
  [rows]
  (into #{} (comp (filter mi/can-read?) (map :id)) rows))

(defn- without-unreadable-collection
  "`result` without its nested `:collection` when the current user can't read that collection.
  A table, and so a measure or segment bound to it, is reachable through data permissions, which say nothing about
  the collection it is published in.
  The nested map carries the collection's name, and [[enrich-with-collection-descriptions]] may have added its
  description."
  [readable-ids result]
  (let [cid (result-collection-id result)]
    (cond-> result
      (and cid (not (collection-result? result)) (not (readable-ids cid)))
      (dissoc :collection))))

(defn- remove-unreadable-collections
  "Drop the nested `:collection` from each result whose collection the current user can't read."
  [results]
  (let [ids          (->> results (remove collection-result?) (keep result-collection-id) distinct)
        readable-ids (if (seq ids)
                       (readable-collection-ids (metabot.db/collection-path-rows ids))
                       #{})]
    (mapv (partial without-unreadable-collection readable-ids) results)))

(defn- enrich-with-collection-paths
  "Stamp each collection-bearing result with :collection_path and :library_member (boolean, gated by the
   :library premium feature).

   :collection_path is the slash-joined chain of ancestor names ending in the name of the collection the result
   lives in (e.g. \"Marketing/Q4 Reports/Email\"). A collection result lives in its parent, so its path ends
   with the parent's name, and a top-level collection gets none.

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
        readable-ids (readable-collection-ids direct-rows)
        ;; The names from the top of the readable chain down to `coll-id`, or down to its parent when
        ;; `include-self?` is false. Only readable ancestors (from :effective_location) contribute names,
        ;; so we never leak the name of a collection the user can't see.
        path-of      (fn [coll-id include-self?]
                       (when-let [{:keys [name]} (and (readable-ids coll-id) (get id->row coll-id))]
                         (let [ancestor-names (->> (ancestor-ids (get id->eff-loc coll-id))
                                                   (keep #(get-in id->row [% :name])))]
                           (not-empty (str/join "/" (cond-> (vec ancestor-names)
                                                      include-self? (conj name)))))))
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
                  path (when cid (path-of cid (not (collection-result? r))))]
              (cond-> (without-unreadable-collection readable-ids r)
                path (assoc :collection_path path)
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

(def ^:private entity-id-lookups
  "Each pair holds the entity types that share an ID space and the function that looks up their entity IDs.
  The function takes a seq of IDs and returns a map of ID to entity ID."
  [[#{"metric" "model" "question"} metabot.db/card-entity-ids]
   [#{"measure"}                   metabot.db/measure-entity-ids]
   [#{"segment"}                   metabot.db/segment-entity-ids]])

(defn- enrich-with-portable-entity-ids
  "Attach `:portable_entity_id` (the entity's `entity_id` NanoID) to saved-question, model, metric, measure and
  segment search results that do not have one yet.
  The LLM can then use it verbatim as `source-card:` (questions and models) or inside a
  `[metric|measure|segment, {}, <entity_id>]` clause without a follow-up `read_resource` round-trip."
  [results]
  ;; The search index doesn't carry `entity_id`, so each lookup is one query for all the types that share it.
  (let [type->id->eid (u/for-map [[types ids->eids] entity-id-lookups
                                  :let [ids (->> results
                                                 (filter (comp types :type))
                                                 (remove :portable_entity_id)
                                                 (keep :id)
                                                 distinct)]
                                  :when (seq ids)
                                  :let [id->eid (ids->eids ids)]
                                  type types]
                        [type id->eid])]
    (cond->> results
      (seq type->id->eid) (mapv (fn [{:keys [id type] :as r}]
                                  (if-let [eid (get-in type->id->eid [type id])]
                                    (assoc r :portable_entity_id eid)
                                    r))))))

(defn- enrich-with-metric-sources
  "Add the source required to use each metric in the search results.

  Return base-table fields, source-card fields, or `:source_unavailable`, as selected by
  [[metabase.metabot.tools.util/metric-required-source]]. Check table query access or card read access separately
  from access to the metric itself.

  Requires `:database_name` on each result (see [[enrich-with-database-engines]]) to build portable FKs.
  Query count is fixed per search call, except that a multi-stage metric defined on a card also reads the cards it is
  built on."
  [results]
  (let [metric-ids (->> results (filter #(= "metric" (:type %))) (keep :id) distinct)
        card-id->source (when (seq metric-ids)
                          (metabot.db/card-source-info metric-ids))
        metric-id->required (into {}
                                  (keep (fn [[metric-id row]]
                                          (when-let [r (metabot.tools.u/metric-required-source row)]
                                            [metric-id r])))
                                  card-id->source)
        metric-id->source-card-id
        (into {}
              (keep (fn [[metric-id r]]
                      (when (= :card (:kind r)) [metric-id (:card-id r)])))
              metric-id->required)
        source-card-id->row
        (metabot.tools.u/readable-source-cards (distinct (vals metric-id->source-card-id)))
        metric-id->table-id (into {}
                                  (keep (fn [[metric-id r]]
                                          (when (and (= :table (:kind r)) (:table-id r))
                                            [metric-id (:table-id r)])))
                                  metric-id->required)
        table-ids (->> metric-id->table-id vals distinct)
        ;; Use the same query permission check as `metric-details` so both tools offer the same sources.
        table-id->row (when (seq table-ids)
                        (into {}
                              (comp (filter mi/can-query?)
                                    (map (juxt :id #(select-keys % [:id :schema :name]))))
                              (metabot.db/table-schema-rows table-ids)))]
    (cond->> results
      (seq metric-ids)
      (mapv (fn [{:keys [id type database_name] :as result}]
              (if (= "metric" type)
                (merge result (metabot.tools.u/metric-source-fields
                               {:source-card   (get source-card-id->row (get metric-id->source-card-id id))
                                :source-table  (get table-id->row (get metric-id->table-id id))
                                :database-name database_name}))
                result))))))

(defn- enrich-with-measure-segment-base-tables
  "Attach `:base_table_portable_fk` (`[database_name schema table]`) to measure and segment results.
  The agent queries a measure or segment against that table, as it does for a metric.
  Requires `:database_name` to already be set on each result, by [[enrich-with-database-engines]].

  Also attach the binding table's collection when the table is published, so [[enrich-with-collection-paths]] can
  mark a measure or segment of a Library table as `library_member`, as it does the table.
  This is wider than `search.scoring/library-score-expr`, which scores measures and segments 0 because their spec
  sets `:collection-id false`. The flag tells the agent whether it can trust the content, and the binding table
  settles that.
  The collection is attached only when the user can read the table."
  [results]
  (let [table-ids            (->> results
                                  (filter (comp #{"measure" "segment"} :type))
                                  (keep :base_table_id)
                                  distinct)
        table-id->collection (when (seq table-ids)
                               (into {}
                                     (keep (fn [{:keys [id collection_id is_published] :as table}]
                                             (when (and is_published collection_id (mi/can-read? table))
                                               [id {:id collection_id}])))
                                     (metabot.db/table-schema-rows table-ids)))]
    (mapv (fn [{:keys [type database_name base_table_id base_table_schema base_table_name] :as r}]
            (if (#{"measure" "segment"} type)
              (cond-> r
                (and database_name base_table_name)
                (assoc :base_table_portable_fk [database_name base_table_schema base_table_name])

                (get table-id->collection base_table_id)
                (assoc :collection (get table-id->collection base_table_id)))
              r))
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

(defn- run-searches
  "Execute multiple search queries in parallel. Returns one `{:ranked results}` per query, or `{:error e}` for a
  query whose search threw, so one failed query doesn't discard the others' results."
  [search-fn search-engine all-queries]
  (let [attempt (fn [query]
                  (try
                    {:ranked (search-fn query search-engine)}
                    (catch Exception e
                      {:error e})))]
    ;; Zero queries case is handled nicely by the >1 branch
    (if (= 1 (count all-queries))
      [(attempt (first all-queries))]
      ;; Create futures for parallel execution
      (mapv deref (mapv #(future (attempt %)) all-queries)))))

(defn- confined-collection-id
  "The collection that a search for `metabot` must stay inside, or nil. A confined metabot (embedded, or
  the nlq profile) may only search inside its own collection."
  [metabot profile-id]
  (when (or (= (:entity_id metabot) metabot.config/embedded-metabot-id)
            (= profile-id "nlq"))
    (:collection_id metabot)))

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
  "Search for data sources (tables, models, cards, dashboards, metrics, measures, segments, transforms) in Metabase.
  Abstracted from the API endpoint logic.

  Optional filter keys threaded straight into the search context: `created-by` (set of user ids),
  `archived`, `collection-id` (numeric, scopes to the collection subtree; see [[scoped-collection-id]]
  for how it combines with a confined metabot's own collection), `offset`. `filters-only?` makes a call with no queries run a single
  nil-query search — a pure listing over the active filters — instead of returning nothing.
  `partial-results?` keeps the other queries' results when a query's search fails, unless every
  search failed; without it, any failure fails the call.

  Each query fetches its full ranked pool (`ranked-results`), the pools are fused by rank, and the
  fused ranking is paginated (`offset`/`limit`) exactly once (`search-results`) — so paging a
  multi-query search is coherent. The result carries the size of the fused, deduped match set as
  `:total` metadata, and the queries whose search failed as `:failed-queries`."
  [{:keys [term-queries semantic-queries database-id created-at last-edited-at
           entity-types limit metabot profile-id weights
           created-by archived collection-id offset filters-only? partial-results?]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:term-query-count     (count term-queries)
              :semantic-query-count (count semantic-queries)
              :database-id          database-id
              :entity-types         entity-types
              :limit                limit
              :metabot-id           (:entity_id metabot)
              :profile-id           profile-id
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
        use-verified?   (:use_verified_content metabot)
        ;; The confined collection is a containment boundary, not a default. A caller-supplied collection-id
        ;; (the v2 search tool fills it from a request filter) can narrow the search within it but never widen it.
        ;; Unconfined, the caller's collection-id applies.
        ;; Measures and segments belong to a table, not a collection, so a search scoped to a collection
        ;; never returns them, even though the search tools list them as entity types.
        collection-id   (scoped-collection-id collection-id (confined-collection-id metabot profile-id))
        limit           (or limit 50)
        ;; the user's data lens, computed once for every context built below
        lens            {:is-impersonated-user? (perms/impersonated-user?)
                         :is-sandboxed-user?    (perms/sandboxed-user?)
                         :is-routed-user?       (perms/routed-user?)}
        ranked-fn       (fn [search-string search-engine]
                          (let [search-context (search/search-context
                                                (cond-> (merge
                                                         lens
                                                         {:search-string                       search-string
                                                          :models                              search-models
                                                          :table-db-id                         database-id
                                                          :created-at                          created-at
                                                          :last-edited-at                      last-edited-at
                                                          :current-user-id                     api/*current-user-id*
                                                          :is-superuser?                       api/*is-superuser?*
                                                          :current-user-perms                  @api/*current-user-permissions-set*
                                                          :filter-items-in-personal-collection "exclude-others"
                                                          :context                             :metabot
                                                          :archived                            (boolean archived)})
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
                          (let [searches (search.engine/disjunction search-engine queries)
                                ;; A disjunction either keeps the queries apart or folds them all into one search.
                                covered  (if (= 1 (count searches)) [queries] (map vector queries))]
                            (mapv #(assoc %1 :queries %2) (run-searches ranked-fn search-engine searches) covered)))
        ;; NOTE: if we add more semantic engines, e.g. 3rd party vector dbs, we'll need to make this more maintainable
        semantic?       #{:search.engine/semantic}
        semantic-engine (u/seek semantic? (search.engine/active-engines))
        fallback-engine (when semantic-engine
                          (search.engine/fallback-engine semantic-engine))
        engine-outcomes (cond
                          ;; A pure listing over the filters: one search with no search string.
                          (and filters-only?
                               (empty? term-queries)
                               (empty? semantic-queries))
                          [[{:ranked (ranked-fn nil nil)}]]

                          ;; Perform semantic and non-semantic search respectively, then fuse results.
                          semantic-engine
                          (into []
                                (keep (fn [[engine queries]] (when (seq queries) (ranked-fn* engine queries))))
                                {semantic-engine semantic-queries
                                 fallback-engine term-queries})

                          ;; Search for all the terms on equal footing, using the default engine.
                          :else
                          [(ranked-fn* nil (distinct (concat term-queries semantic-queries)))])
        outcomes        (apply concat engine-outcomes)
        failed          (filter :error outcomes)
        _               (when (seq failed)
                          (when (or (not partial-results?) (every? :error outcomes))
                            (throw (:error (first failed))))
                          (doseq [{:keys [error]} failed]
                            (log/error error "[METABOT-SEARCH] A search query failed; returning the other queries' results")))
        fused-ranked    (reciprocal-rank-fusion
                         (for [engine-outcome engine-outcomes]
                           (reciprocal-rank-fusion (keep :ranked engine-outcome))))
        ;; Paginate and hydrate the fused ranking exactly once. `search-results` slices to
        ;; [offset, offset+limit) and reports `:total` as the size of the full fused set — so the
        ;; total is knowable even under multi-query fusion, and only the returned page is hydrated.
        {:keys [data total]} (search/search-results
                              (search/search-context (merge lens
                                                            {:search-string      nil
                                                             :models             search-models
                                                             :current-user-id    api/*current-user-id*
                                                             :current-user-perms @api/*current-user-permissions-set*
                                                             :is-superuser?      api/*is-superuser?*
                                                             :offset             (or offset 0)
                                                             :limit              limit}))
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
             enrich-with-metric-sources
             enrich-with-measure-segment-base-tables
             ;; after base tables: that step resolves a measure/segment's binding collection
             remove-unreadable-collections
             (validate-and-enrich-documents (boolean archived)))
        (vary-meta assoc
                   :total total
                   :failed-queries (into [] (comp (mapcat :queries) (distinct)) failed)))))

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
     - the query is empty or has a single distinct token
     - the agent already used `or` (so OR-broadening would be redundant)
     - the agent used a quoted phrase (treat as a deliberate exact-match intent)
     - the agent excluded a word (OR-joined branches would drop the exclusion and surface exactly what was
       ruled out)"
  [q]
  (when (and q
             (not (str/includes? q "\""))
             (not (re-find #"(?i)\bor\b" q))
             ;; the same test `search.util/to-tsquery-expr` uses to read a word as negated
             (not (re-find #"(?:^|\s)-\w" q)))
    (let [tokens (->> (str/split q #"\s+")
                      ;; Strip clinging edge punctuation so "sales, revenue" broadens to
                      ;; "sales or revenue", not "sales, or revenue".
                      (map #(str/replace % #"^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$" ""))
                      (remove str/blank?)
                      (remove #(query-broadening-stopwords (u/lower-case-en %))))]
      ;; Decide on distinct words: repeats of one word OR to the query that just came back empty. Keep the
      ;; repeats in the output, though: `to-tsquery-expr` reads a repeated final word as typed in full rather
      ;; than as a prefix, and dropping the repeat would hand that prefix to a different word.
      (when (> (count (distinct (map u/lower-case-en tokens))) 1)
        (str/join " or " tokens)))))

;; TODO (Chris 2026-09-30) -- Two search entry points have diverged. [[search]] is the multi-query search (term and
;; semantic queries, fused by rank, paginated) behind MCP v2's `search` tool and `/v1/search`. [[search-by-query]] is
;; the single-query search the Metabot tools use, with its own engine choice, zero-hit broadening, and richer result
;; enrichment. We may want to consolidate them once it's clear which shape both callers should share.
(defn search-by-query
  "Search for data sources (tables, models, cards, dashboards, metrics, measures, segments, collections) in Metabase
  with a single query string. This is the Metabot tools' search.

  Routes the query to the semantic engine when available. That engine already blends keyword and vector matching for
  one query (see `metabase-enterprise.search.semantic.scoring/rrf-rank-exp`), so no metabot-level fusion is needed.
  Otherwise the instance's default keyword engine runs it.

  The keyword (appdb) engine ANDs every token in the input, so one extra qualifier word can collapse the result set to
  zero. When the first call returns no hits, the search retries once with the tokens OR-joined by [[broaden-query]].
  It skips that retry when the query is a single token, is quoted, or already uses `or`.

  The result carries the size of the whole match set as `:total` metadata, so the caller can tell that `limit`
  cut it short. When the results come from the retry, `:broadened-query` metadata holds the query that found them.
  `:collection-id` metadata is the collection the search ran in, after [[scoped-collection-id]]."
  [{:keys [query database-id collection-id created-at last-edited-at
           entity-types limit metabot profile-id weights]}]
  (log/infof "[METABOT-SEARCH] Starting search with params: %s"
             {:database-id  database-id
              :entity-types entity-types
              :limit        limit
              :metabot-id   (:entity_id metabot)
              :profile-id   profile-id
              :weights      weights})
  (let [search-models  (if (seq entity-types)
                         (set (distinct (keep metabot.search-models/entity-type->search-model entity-types)))
                         metabot-search-models)
        _              (log/infof "[METABOT-SEARCH] Converted entity-types %s to search-models %s" entity-types search-models)
        use-verified?  (:use_verified_content metabot)
        ;; A caller-supplied collection narrows a confined metabot's search but never widens it.
        collection-id  (scoped-collection-id collection-id (confined-collection-id metabot profile-id))
        limit          (or limit 50)
        ;; Pick the engine that will actually run the search. Semantic blends keyword and vector matching itself,
        ;; so it gets first refusal when active. Otherwise the instance's default precedence decides, typically
        ;; appdb but `in-place` on minimal installs. Choosing here lets the broadening below branch on the engine.
        picked-engine  (search.engine/resolved-engine)
        run-engine     (fn [search-string]
                         (search/search
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
                                    :is-routed-user?                     (perms/routed-user?)
                                    :is-superuser?                       api/*is-superuser?*
                                    :current-user-perms                  @api/*current-user-permissions-set*
                                    :filter-items-in-personal-collection "exclude-others"
                                    :context                             :metabot
                                    :archived                            false
                                    :limit                               limit
                                    :offset                              0}
                             weights       (assoc :weights weights)
                             use-verified? (assoc :curated true)
                             collection-id (assoc :collection collection-id)))))
        primary        (run-engine query)
        ;; The `or` rewrite only broadens where lowercase `or` compiles to a tsquery `|`; see
        ;; [[search.engine/tsquery-operators-supported?]] for where that holds. Semantic is excluded as well,
        ;; because it already blends keyword and vector matching.
        ;; The retry is optional: if it fails, the first search's empty result stands.
        {:keys [data total broadened-query]}
        (or (when (and (empty? (:data primary))
                       (not= picked-engine :search.engine/semantic)
                       (search.engine/tsquery-operators-supported?))
              (when-let [broadened (broaden-query query)]
                (log/info "[METABOT-SEARCH] Zero hits; retrying with an OR-broadened query")
                (try
                  (let [retry (run-engine broadened)]
                    (when (seq (:data retry))
                      (assoc retry :broadened-query broadened)))
                  (catch Exception e
                    (log/warn e "[METABOT-SEARCH] OR-broadened retry failed; keeping the empty result")
                    nil))))
            primary)]
    (log/infof "[METABOT-SEARCH] Query returned entity types: %s" (frequencies (map :model data)))
    (-> (->> data
             (take limit)
             (map postprocess-search-result)
             enrich-with-collection-descriptions
             enrich-with-database-engines
             enrich-with-portable-entity-ids
             enrich-with-metric-sources
             enrich-with-measure-segment-base-tables
             ;; after base tables: that step resolves a measure/segment's binding collection
             enrich-with-collection-paths
             (validate-and-enrich-documents false)
             remove-unreadable-transforms)
        (with-meta (m/assoc-some {:total total}
                                 :broadened-query broadened-query
                                 :collection-id   collection-id)))))

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
         enrich-with-metric-sources
         enrich-with-measure-segment-base-tables
         ;; after base tables: that step resolves a measure/segment's binding collection
         enrich-with-collection-paths
         remove-unreadable-transforms)))

(def ^:private default-search-limit 25)
(def ^:private max-search-limit 50)

(def ^:private databaseless-types
  "Entity types that don't belong to a database, so a `database_id` filter leaves them out."
  #{"collection" "dashboard" "document"})

(defn- search-restrictions
  "What narrowed a search beyond its queries, as sentences for the model. `searched-collection-id` is the collection
  the search actually ran in, which differs from the caller's `collection_id` when a confined Metabot ignored it."
  [default-types {:keys [metabot profile-id]} {:keys [entity_types collection_id database_id]} searched-collection-id]
  (cond-> []
    (and (seq entity_types) (not-every? (set entity_types) default-types))
    (conj (str "Only these entity types were searched: " (str/join ", " (sort (set entity_types)))
               ". If other types could match, add them to `entity_types`."))

    (and database_id (some databaseless-types default-types))
    (conj (str "Only database " database_id " was searched, so dashboards, collections and documents were left out. "
               "To search everywhere, leave out `database_id`."))

    (and collection_id (= collection_id searched-collection-id))
    (conj (str "Only collection " collection_id " and the collections inside it were searched. "
               "To search everywhere, leave out `collection_id`."))

    (:use_verified_content metabot)
    (conj "This Metabot searches only curated content, such as verified items and items in official collections.")

    (confined-collection-id metabot profile-id)
    (conj "This Metabot searches only inside its own collection.")))

(defn- format-search-output
  "Format search results as an LLM-ready string, one XML element per result.
  `limit` is the page size the search asked for, and `restrictions` are the [[search-restrictions]] that explain an
  empty result."
  [query results limit restrictions]
  (let [results-xml (str/join "\n" (map llm-shape/search-result->xml results))
        {:keys [total broadened-query]} (meta results)]
    (te/lines
     (str "<results query=\"" (llm-shape/escape-xml query) "\""
          (when broadened-query
            (str " broadened_query=\"" (llm-shape/escape-xml broadened-query) "\""))
          " total=\"" (count results) "\">")
     results-xml
     "</results>"
     (when broadened-query
       (str "Nothing matched every word of `query`, so these results match any one of its words. "
            "Check that a result fits the whole request before using it."))
     ;; Search caps the ranked pool, so the total is a lower bound.
     (when (and total (< limit total))
       (str "Showing " (count results) " of at least " total " results. "
            "To see more, raise `limit` (max " max-search-limit ") or make the query more specific."))
     (when (empty? results)
       ["<no-results>"
        restrictions
        (str "Retry once with a shorter `query`: one or two distinctive words, or a synonym. "
             "If that also finds nothing, tell the user instead of searching again.")
        "</no-results>"])
     "<instructions>"
     instructions/search-result-instructions "</instructions>")))

;; Field-level descriptions surface to the model as JSON-Schema `description`s on the
;; tool's input parameters (via `malli.json-schema` in `metabase.metabot.self.claude`).
;; The system prompt's discovery section, where a profile includes it, says how this instance matches a query and
;; which operators it reads. `query-desc` covers what holds on every engine, for profiles without that section.
(def ^:private query-desc
  (str "What to look for: the likely name of the thing, in one to three words. "
       "Unless the system prompt says otherwise, a result must contain every word, so a long phrase can match nothing."))

(def ^:private query-schema
  [:and {:description query-desc} ms/NonBlankString])

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
  exact entity icon, matching the app's search/command-palette icons.
  `:table_id` is the base table of a measure or segment, which the client needs to link to it."
  [r]
  (-> (select-keys r [:id :type :name :display_name :database_id :database_schema :database_name])
      (m/assoc-some :display (some-> (:display r) name)
                    :moderated_status (:moderated_status r)
                    :table_id (when (#{"measure" "segment"} (:type r)) (:base_table_id r))
                    :collection (some-> (:collection r) (select-keys [:id :name])))))

(defn- browse-instead-step
  [& uri-text]
  {:uses #{"read_resource"}
   :text (apply str "Find the data with `read_resource` instead: " uri-text)})

(mr/def ::search-scope
  "What a search reaches: the collection or database it is limited to, if any. `verified-only` is true when the
  search is limited to verified content but `read_resource` is not, as in the profiles exempt from curation."
  [:map {:closed true}
   [:collection-id [:maybe :int]]
   [:database-id   [:maybe :int]]
   [:verified-only :boolean]])

(defn search-scope
  "The [[::search-scope]] of a search for the Metabot row `metabot`.
  `profile-id` names the profile the search runs under, and `database-id`, unless nil, is the database it is limited
  to.
  `collection-id`, unless nil, is the collection the caller asked for; it narrows the scope as [[scoped-collection-id]]
  allows."
  ([metabot profile-id database-id]
   (search-scope metabot profile-id database-id nil))
  ([metabot profile-id database-id collection-id]
   {:collection-id (scoped-collection-id collection-id (confined-collection-id metabot profile-id))
    :database-id   database-id
    :verified-only (and (boolean (:use_verified_content metabot))
                        (not (shared/curated-only?)))}))

(defn browse-steps
  "The recovery steps that find with `read_resource` what a search over a [[::search-scope]] could have found.
  They browse only what the search was limited to, so a `verified-only` scope gets none."
  [{:keys [collection-id database-id verified-only]}]
  (cond
    verified-only
    []

    collection-id
    [(browse-instead-step "read `metabase://collection/" collection-id "/items`.")]

    database-id
    [(browse-instead-step "read `metabase://database/" database-id "/tables` and `metabase://database/"
                          database-id "/models`.")]

    :else
    [(browse-instead-step "read `metabase://collections` for metrics, models, questions and "
                          "dashboards, or `metabase://databases`, then `metabase://database/{id}/tables`, "
                          "for tables.")]))

(def ^:private no-retry-step
  {:uses #{"search"}
   :text (str "Do not call `search` again in this turn. If you cannot find the data another way, "
              "tell the user that search is unavailable right now.")})

(tools/defrecoverable search-failed!
  "The search backend failed, for example because the search index is missing.

  Every failure gets [[no-retry-step]], because each retry uses an iteration and logs a stack trace."
  {:payload ::search-scope}
  [scope]
  {:message  "Search failed."
   :recovery (conj (browse-steps scope) no-retry-step)})

(defn- do-search
  [default-types search-opts {:keys [query entity_types limit collection_id] :as args}]
  ;; Recoverable, not `:internal`: the agent can find the data without search, or tell the user that
  ;; search failed. `read_resource` does not use the search index.
  (let [limit        (min max-search-limit (or limit default-search-limit))
        opts         (merge {:query        query
                             :entity-types (or (seq entity_types) (vec default-types))
                             :limit        limit}
                            search-opts
                            (when collection_id
                              {:collection-id collection_id}))
        results      (try
                       (search-by-query opts)
                       (catch Exception e
                         ;; The runtime logs a recoverable error at debug level, without its cause.
                         (log/error e "Metabot search failed")
                         (search-failed! (search-scope (:metabot opts) (:profile-id opts) (:database-id opts)
                                                       collection_id))))
        restrictions (search-restrictions default-types search-opts args (:collection-id (meta results)))]
    {:output (format-search-output query results limit restrictions)
     :structured-output (cond-> {:result-type :search
                                 :data results
                                 :total_count (count results)}
                          (empty? results) (assoc :empty_reason (if (seq restrictions) "restricted" "no_match")))
     :data-parts [(streaming/search-results-part
                   {:total_count (count results)
                    :results (mapv search-result->item results)})]}))

(def ^:private general-entity-types
  "The entity types the general and NLQ search tools accept."
  (sorted-set "collection"
              "dashboard"
              "document"
              "measure"
              "metric"
              "model"
              "question"
              "segment"
              "table"))

(def ^:private search-schema
  [:map {:closed true}
   [:query query-schema]
   [:entity_types {:optional true} (apply entity-types-schema general-entity-types)]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:limit {:optional true} limit-schema]])

(defn- search-display
  [{:keys [query]}]
  ;; just the object (the query) — the client wraps it in the verb + tense
  ;; ("Searching for …" while active, "Searched for …" once finished). The title runs before argument
  ;; validation, so a malformed query yields no title rather than an error.
  (when (string? query)
    (not-empty query)))

(tools/defrecoverable unavailable-database!
  "The database for this SQL search does not exist or the user cannot read it."
  {:payload [:map {:closed true} [:database-id :int]]}
  [{:keys [database-id]}]
  {:message (str "Database " database-id
                 " was not found. It may not exist, or you may not have access to it.")
   :recovery [{:uses #{}
               :text "In the SQL editor, use the database currently selected there. Elsewhere, leave out `database_id`."}
              {:uses #{"read_resource"}
               :text "Call `read_resource` with `metabase://databases` to find an accessible database ID."}]})

(defn- check-search-database!
  [database-id]
  (when-not (and (pos-int? database-id)
                 (when-let [database (metabot.db/database-summary database-id)]
                   (mi/can-read? database)))
    (unavailable-database! {:database-id database-id})))

(defrecord SearchTool [description args default-types search-opts]
  tools/Tool
  (declaration [_]
    {:name "search"
     :description description
     :args args
     :scope scope/agent-search
     :metabot/title-fn search-display})
  (handle [_ {:keys [database_id] :as args} {:keys [metabot]}]
    (when (some? database_id)
      (check-search-database! database_id))
    (do-search default-types
               (cond-> (assoc search-opts :metabot metabot)
                 (some? database_id) (assoc :database-id database_id))
               args)))

(def search-tool
  "The general `search` tool."
  (->SearchTool
   "Find tables, models, metrics, measures, segments, dashboards, documents, saved questions, and collections by topic across the instance. Use it when you don't know where something lives; once you have a hit, drill into it with read_resource rather than searching the same concept again."
   search-schema general-entity-types {}))

(def ^:private sql-search-schema
  [:map {:closed true}
   [:query query-schema]
   [:database_id :int]
   [:entity_types {:optional true} (entity-types-schema "table" "model")]
   [:limit {:optional true} limit-schema]])

(def sql-search-tool
  "The SQL `search` tool."
  (->SearchTool
   "Find SQL-queryable data sources (tables and models) within a specific database by topic."
   sql-search-schema (sorted-set "model" "table") {}))

(def ^:private nlq-search-schema
  [:map {:closed true}
   [:query query-schema]
   [:entity_types {:optional true} (apply entity-types-schema general-entity-types)]
   [:database_id   {:optional true} [:maybe :int]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:limit {:optional true} limit-schema]])

(def nlq-search-tool
  "The NLQ `search` tool."
  (->SearchTool
   "Find NLQ-queryable data sources (tables, models, metrics, measures, segments, questions, and collections) by topic, or find dashboards and documents as save destinations."
   nlq-search-schema ["collection" "metric" "measure" "segment" "model" "question" "table"] {:profile-id "nlq"}))
