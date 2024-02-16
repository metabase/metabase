(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries like

    {:source-table \"card__1\" ; Shorthand for using Card 1 as source query
     ...}

  and resolves the referenced source query, transforming the query to look like the following:

    {:source-query    {...} ; Query for Card 1
     :source-metadata [...] ; metadata about columns in Card 1
     :source-card-id  1     ; Original Card ID
     ...}

  This middleware resolves Card ID `:source-table`s at all levels of the query, but the top-level query often uses the
  so-called `virtual-id`, because the frontend client might not know the original Database; this middleware will
  replace that ID with the appropriate ID, e.g.

    {:database <virtual-id>, :type :query, :query {:source-table \"card__1\"}}
    ->
    {:database 1, :type :query, :query {:source-query {...}, :source-metadata {...}, :source-card-id 1}}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.util :as driver.u]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.persisted-cache :as qp.persisted]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [weavejester.dependency :as dep]))

(set! *warn-on-reflection* true)

;; These next two schemas are for validating the intermediate stages of the middleware. We don't need to validate the
;; entire query
(def ^:private SourceQueryAndMetadata
  [:map
   [:source-query    mbql.s/SourceQuery]
   [:database        mbql.s/DatabaseID]
   [:source-metadata [:maybe [:sequential mbql.s/SourceQueryMetadata]]]
   [:source-query/dataset? {:optional true} :boolean]
   [:persisted-info/native {:optional true} :string]])

(def ^:private MapWithResolvedSourceQuery
  [:and
   [:map
    [:database        mbql.s/DatabaseID]
    [:source-metadata [:maybe [:sequential mbql.s/SourceQueryMetadata]]]
    [:source-query    mbql.s/SourceQuery]
    [:source-card-id  ms/PositiveInt]]
   [:fn
    {:error/message "`:source-table` should be removed"}
    (complement :source-table)]])

(defn- query-has-unresolved-card-id-source-tables? [{inner-mbql-query :query}]
  (when inner-mbql-query
    (mbql.u/match-one inner-mbql-query
      (&match :guard (every-pred map? (comp string? :source-table))))))

(defn- query-has-resolved-database-id? [{:keys [database]}]
  ((every-pred integer? pos?) database))

(def ^:private FullyResolvedQuery
  "Schema for a MBQL query where all `card__id` `:source-tables` have been removes and appropriate `:source-query`s have
  been added instead, and where the top-level `:database` ID, if it was the 'source query placeholder`, is replaced by
  the actual database ID of the source query.

  This schema represents the way the query should look after this middleware finishes preprocessing it."
  [:and
   mbql.s/Query
   [:fn
    {:error/message "Query where all card__id :source-tables are fully resolved"}
    (complement query-has-unresolved-card-id-source-tables?)]
   [:fn
    {:error/message "Query where source-query virtual `:database` has been replaced with actual Database ID"}
    query-has-resolved-database-id?]])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Resolving card__id -> source query                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- source-query
  "Get the query to be run from the card"
  [{dataset-query :dataset-query, card-id :id, :as card}]
  (let [dataset-query (cond-> dataset-query
                        (:lib/type dataset-query) lib.convert/->legacy-MBQL)
        {db-id                                           :database
         mbql-query                                      :query
         {template-tags :template-tags :as native-query} :native} dataset-query]
    (or
     mbql-query
     ;; rename `:query` to `:native` because source queries have a slightly different shape
     (when-some [native-query (set/rename-keys native-query {:query :native})]
       (let [mongo? (= (driver.u/database->driver db-id) :mongo)]
         (cond-> native-query
           ;; MongoDB native  queries consist of a collection and a pipelne (query)
           mongo? (update :native (fn [pipeline] {:collection (:collection native-query)
                                                  :query      pipeline}))
           (empty? template-tags) (dissoc :template-tags))))
     (throw (ex-info (tru "Missing source query in Card {0}" card-id)
                     {:card card, :dataset-query dataset-query})))))

(mu/defn card-id->source-query-and-metadata :- SourceQueryAndMetadata
  "Return the source query info for Card with `card-id`. Pass true as the optional second arg `log?` to enable
  logging. (The circularity check calls this and will print more than desired)"
  ([card-id :- ::lib.schema.id/card]
   (card-id->source-query-and-metadata card-id false))

  ([card-id :- ::lib.schema.id/card log? :- :boolean]
   (let [;; todo: we need to cache this. We are running this in preprocess, compile, and then again
         card           (or (lib.metadata/card (qp.store/metadata-provider) card-id)
                            (throw (ex-info (tru "Card {0} does not exist." card-id)
                                            {:card-id card-id})))
         persisted-info (:lib/persisted-info card)
         {{database-id :database} :dataset-query
          result-metadata         :result-metadata
          dataset?                :dataset} card
         persisted?     (qp.persisted/can-substitute? card persisted-info)
         source-query   (source-query card)]
     (when (and persisted? log?)
       (log/info (trs "Found substitute cached query for card {0} from {1}.{2}"
                      card-id
                      (ddl.i/schema-name {:id database-id} (public-settings/site-uuid))
                      (:table-name persisted-info))))

     ;; log the query at this point, it's useful for some purposes
     (log/debug (trs "Fetched source query from Card {0}:" card-id)
                "\n"
                (u/pprint-to-str 'yellow source-query))

     (cond-> {:source-query    (cond-> source-query
                                 ;; This will be applied, if still appropriate, by the peristence middleware
                                 persisted?
                                 (assoc :persisted-info/native
                                        (qp.persisted/persisted-info-native-query
                                         (u/the-id (lib.metadata/database (qp.store/metadata-provider)))
                                         persisted-info)))
              :database        database-id
              :source-metadata (seq (map mbql.normalize/normalize-source-metadata result-metadata))}
       dataset? (assoc :source-query/dataset? dataset?)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Logic for traversing the query                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^{:arglists '([x])} map-with-card-id-source-table?
  "Is `x` a map with a \"card__id\" `:source-table`, i.e., something this middleware needs to resolve?"
  (every-pred
   map?
   (comp string? :source-table)
   (comp (partial re-matches mbql.s/source-table-card-id-regex) :source-table)))

(mu/defn ^:private resolve-one :- MapWithResolvedSourceQuery
  [{:keys [source-table], :as m} :- [:map [:source-table mbql.s/source-table-card-id-regex]]]
  (let [card-id                   (-> source-table lib.util/legacy-string-table-id->card-id)
        source-query-and-metadata (-> card-id (card-id->source-query-and-metadata true))]
    (merge
     (dissoc m :source-table)
     ;; record the `card-id` we've resolved here. We'll include it in `:info` for permissions purposes later
     {:source-card-id card-id}
     source-query-and-metadata)))

(defn- resolve-all*
  [m]
  (mbql.u/replace m
    map-with-card-id-source-table?
    ;; if this is a map that has a Card ID `:source-table`, resolve that (replacing it with the appropriate
    ;; `:source-query`, then recurse and resolve any nested-nested queries that need to be resolved too
    (let [resolved (if (public-settings/enable-nested-queries)
                     (resolve-one &match)
                     (throw (ex-info (trs "Nested queries are disabled")
                                     {:clause &match})))]
      ;; wrap the recursive call in a try-catch; if the recursive resolution fails, add context about the
      ;; resolution that were we in the process of
      (try
        (resolve-all* resolved)
        (catch Throwable e
          (throw (ex-info (tru "Error resolving source query")
                          {:resolving &match, :resolved resolved}
                          e)))))))

(defn- check-for-circular-references
  "Check that there are no circular dependencies among source cards. This is equivalent to
   finding a topological sort of the dependency graph.
   https://en.wikipedia.org/wiki/Topological_sorting"
  ([m]
   (check-for-circular-references (dep/graph) m)
   m)
  ([g m]
   (transduce (comp (filter map-with-card-id-source-table?)
                    (map (comp card-id->source-query-and-metadata
                               lib.util/legacy-string-table-id->card-id
                               :source-table)))
              (fn
                ([] g)
                ([g source-query]
                 (-> g
                     (dep/depend m source-query)
                     ;; Recursive call will circuit break the moment there's a cycle, so no
                     ;; danger of unbounded recursion.
                     (check-for-circular-references source-query)))
                ([g]
                 ;; This will throw if there's a cycle
                 (dep/topo-sort g)
                 g))
              (tree-seq coll? identity m))))

(defn- copy-source-query-database-ids
  "If `m` has the saved questions virtual `:database` ID, (recursively) look for actual resolved Database IDs in the
  next level down and copy it to our level."
  [{:keys [database], :as m}]
  (if (and database (not= database lib.schema.id/saved-questions-virtual-database-id))
    m
    (let [{:keys [query source-query], :as m}
          (cond-> m
            (:query m)        (update :query        copy-source-query-database-ids)
            (:source-query m) (update :source-query copy-source-query-database-ids))

          db-id
          (some (fn [{:keys [database]}]
                  (when (some-> database (not= lib.schema.id/saved-questions-virtual-database-id))
                    database))
                [source-query query])]
      (cond-> m
        db-id (assoc :database db-id)))))

(defn- remove-unneeded-database-ids
  "Remove `:database` from all levels besides the top level."
  [m]
  (mbql.u/replace-in m [:query]
    (&match :guard (every-pred map? :database (comp integer? :database)))
    (recur (dissoc &match :database))))

(mu/defn ^:private extract-resolved-card-id :- [:map
                                                [:card-id [:maybe ms/PositiveInt]]
                                                [:query   :map]]
  "If the ID of the Card we've resolved (`:source-card-id`) was added by a previous step, add it
  to `:query` `:info` (so it can be included in the QueryExecution log), then return a map with the resolved
  `:card-id` and updated `:query`."
  [query :- :map]
  (let [card-id (get-in query [:query :source-card-id])]
    {:query   (cond-> query
                card-id (update-in [:info :card-id] #(or % card-id)))
     :card-id card-id}))

(mu/defn ^:private resolve-all :- [:map
                                   [:card-id [:maybe ms/PositiveInt]]
                                   [:query   :map]]
  "Recursively replace all Card ID source tables in `query` with resolved `:source-query` and `:source-metadata`. Since
  the `:database` is only useful for top-level source queries, we'll remove it from all other levels."
  [query :- :map]
  ;; if a `:source-card-id` is already in the query, remove it, so we don't pull user-supplied input up into `:info`
  ;; allowing someone to bypass permissions
  (-> (m/dissoc-in query [:query :source-card-id])
      check-for-circular-references
      resolve-all*
      copy-source-query-database-ids
      remove-unneeded-database-ids
      extract-resolved-card-id))

(mu/defn resolve-card-id-source-tables* :- [:map
                                            [:card-id [:maybe ms/PositiveInt]]
                                            [:query   FullyResolvedQuery]]
  "Resolve `card__n`-style `:source-tables` in `query`."
  [{inner-query :query, :as outer-query} :- mbql.s/Query]
  (if-not inner-query
    ;; for non-MBQL queries there's nothing to do since they have nested queries
    {:query outer-query, :card-id nil}
    ;; Otherwise attempt to expand any source queries as needed. Pull the `:database` key up into the top-level if it
    ;; exists
    (resolve-all outer-query)))

(defn resolve-card-id-source-tables
  "Pre-processing middleware that assocs the `:source-query` for this query if it was specified using the shorthand
  `:source-table` `card__n` format."
  [query]
  (let [{:keys [query card-id]} (resolve-card-id-source-tables* query)]
    (if card-id
      (assoc query ::source-card-id card-id)
      (dissoc query ::source-card-id))))

(defn add-dataset-info
  "Post-processing middleware that adds `:dataset` `true` or `false` to queries with a source card."
  [{::keys [source-card-id], :as _preprocessed-query} rff]
  (if-not source-card-id
    rff
    (let [dataset? (:dataset (lib.metadata.protocols/card (qp.store/metadata-provider) source-card-id))]
      (fn rff' [metadata]
        (rff (cond-> metadata dataset? (assoc :dataset dataset?)))))))
