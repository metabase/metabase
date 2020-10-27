(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries like

    {:source-table \"card__1\" ; Shorthand for using Card 1 as source query
     ...}

  and resolves the referenced source query, transforming the query to look like the following:

    {:source-query    {...} ; Query for Card 1
     :source-metadata [...] ; metadata about columns in Card 1
     ...}

  This middleware resolves Card ID `:source-table`s at all levels of the query, but the top-level query often uses the
  so-called `virtual-id`, because the frontend client might not know the original Database; this middleware will
  replace that ID with the approiate ID, e.g.

    {:database <virtual-id>, :type :query, :query {:source-table \"card__1\"}}
    ->
    {:database 1, :type :query, :query {:source-query {...}, :source-metadata {...}}}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require [clojure
             [set :as set]
             [string :as str]]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.mbql
             [normalize :as normalize]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u]
            [metabase.util
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]
            [weavejester.dependency :as dep]))

;; These next two schemas are for validating the intermediate stages of the middleware. We don't need to validate the
;; entire query
(def ^:private SourceQueryAndMetadata
  {:source-query    mbql.s/SourceQuery
   :database        mbql.s/DatabaseID
   :source-metadata [mbql.s/SourceQueryMetadata]})

(def ^:private MapWithResolvedSourceQuery
  (s/constrained
   {:database        mbql.s/DatabaseID
    :source-metadata [mbql.s/SourceQueryMetadata]
    :source-query    mbql.s/SourceQuery
    s/Keyword        s/Any}
   (complement :source-table)
   "`:source-table` should be removed"))

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
  (-> mbql.s/Query
      (s/constrained (complement query-has-unresolved-card-id-source-tables?)
                     "Query where all card__id :source-tables are fully resolved")
      (s/constrained query-has-resolved-database-id?
                     "Query where source-query virtual `:database` has been replaced with actual Database ID")))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Resolving card__id -> source query                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private trim-sql-query :- su/NonBlankString
  "Native queries can have trailing SQL comments. This works when executed directly, but when we use the query in a
  nested query, we wrap it in another query, which can cause the last part of the query to be unintentionally
  commented out, causing it to fail. This function removes any trailing SQL comment."
  [card-id :- su/IntGreaterThanZero, query-str :- su/NonBlankString]
  (let [trimmed-string (str/replace query-str #"--.*(\n|$)" "")]
    (if (= query-str trimmed-string)
      query-str
      (do
        (log/info (trs "Trimming trailing comment from card with id {0}" card-id))
        trimmed-string))))

(s/defn card-id->source-query-and-metadata :- SourceQueryAndMetadata
  "Return the source query info for Card with `card-id`."
  [card-id :- su/IntGreaterThanZero]
  (let [card
        (or (db/select-one [Card :dataset_query :database_id :result_metadata] :id card-id)
            (throw (ex-info (tru "Card {0} does not exist." card-id)
                            {:card-id card-id})))

        {{mbql-query                   :query
          database-id                  :database
          {template-tags :template-tags
           :as           native-query} :native} :dataset_query
         result-metadata                        :result_metadata}
        card

        source-query
        (or mbql-query
            (when native-query
              ;; rename `:query` to `:native` because source queries have a slightly different shape
              (let [native-query (set/rename-keys native-query {:query :native})]
                (cond-> native-query
                  ;; trim trailing slashes from SQL, but not other types of native queries
                  (string? (:native native-query)) (update :native (partial trim-sql-query card-id))
                  (empty? template-tags)           (dissoc :template-tags))))
            (throw (ex-info (tru "Missing source query in Card {0}" card-id)
                            {:card card})))]
    ;; log the query at this point, it's useful for some purposes
    ;;
    ;; TODO - it would be nicer if we could just have some sort of debug function to store useful bits of context
    ;; somewhere, then if the query fails we can dump it all out
    (when-not i/*disable-qp-logging*
      (log/info (trs "Fetched source query from Card {0}:" card-id)
                "\n"
                (u/pprint-to-str 'yellow source-query)))
    {:source-query    source-query
     :database        database-id
     :source-metadata (normalize/normalize-fragment [:query :source-metadata] result-metadata)}))

(s/defn ^:private source-table-str->card-id :- su/IntGreaterThanZero
  [source-table-str :- mbql.s/source-table-card-id-regex]
  (when-let [[_ card-id-str] (re-find #"^card__(\d+)$" source-table-str)]
    (Integer/parseInt card-id-str)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Logic for traversing the query                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^{:arglists '([x])} map-with-card-id-source-table?
  "Is `x` a map with a \"card__id\" `:source-table`, i.e., something this middleware needs to resolve?"
  (every-pred
   map?
   (comp string? :source-table)
   (comp (partial re-matches mbql.s/source-table-card-id-regex) :source-table)))

(s/defn ^:private resolve-one :- MapWithResolvedSourceQuery
  [{:keys [source-table], :as m} :- {:source-table mbql.s/source-table-card-id-regex, s/Keyword s/Any}]
  (let [card-id                   (-> source-table source-table-str->card-id)
        source-query-and-metadata (-> card-id card-id->source-query-and-metadata)]
    (merge
     (dissoc m :source-table)
     ;; record the `::card-id` we've resolved here. We'll include it in `:info` for permissions purposes later
     {::card-id card-id}
     source-query-and-metadata)))

(defn- resolve-all*
  [m]
  (mbql.u/replace m
    map-with-card-id-source-table?
    ;; if this is a map that has a Card ID `:source-table`, resolve that (replacing it with the appropriate
    ;; `:source-query`, then recurse and resolve any nested-nested queries that need to be resolved too
    (let [resolved (resolve-one &match)]
      ;; wrap the recursive call in a try-catch; if the recursive resolution fails, add context about the
      ;; resolution that were we in the process of
      (try
        (resolve-all* resolved)
        (catch Throwable e
          (throw (ex-info (.getMessage e)
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
                               source-table-str->card-id
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
  (if (and database (not= database mbql.s/saved-questions-virtual-database-id))
    m
    (let [{:keys [query source-query], :as m}
          (cond-> m
            (:query m)        (update :query        copy-source-query-database-ids)
            (:source-query m) (update :source-query copy-source-query-database-ids))

          db-id
          (some (fn [{:keys [database]}]
                  (when (some-> database (not= mbql.s/saved-questions-virtual-database-id))
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

(defn- add-card-id-to-info
  "If the ID of the Card we've resolved (`::card-id`) was added by a previous step, add it to `:info` so it can be used
  for permissions purposes; remove any `::card-id`s in the query."
  [query]
  (let [card-id (get-in query [:query ::card-id])
        query   (mbql.u/replace-in query [:query]
                  (&match :guard (every-pred map? ::card-id))
                  (recur (dissoc &match ::card-id)))]
    (cond-> query
      card-id (update-in [:info :card-id] #(or % card-id)))))

(s/defn ^:private resolve-all :- su/Map
  "Recursively replace all Card ID source tables in `query` with resolved `:source-query` and `:source-metadata`. Since
  the `:database` is only useful for top-level source queries, we'll remove it from all other levels."
  [query :- su/Map]
  ;; if a `::card-id` is already in the query, remove it, so we don't pull user-supplied input up into `:info`
  ;; allowing someone to bypass permissions
  (-> (m/dissoc-in query [:query ::card-id])
      check-for-circular-references
      resolve-all*
      copy-source-query-database-ids
      remove-unneeded-database-ids
      add-card-id-to-info))

(s/defn ^:private resolve-card-id-source-tables* :- FullyResolvedQuery
  "Resolve `card__n`-style `:source-tables` in `query`."
  [{inner-query :query, :as outer-query} :- mbql.s/Query]
  (if-not inner-query
    ;; for non-MBQL queries there's nothing to do since they have nested queries
    outer-query
    ;; Otherwise attempt to expand any source queries as needed. Pull the `:database` key up into the top-level if it
    ;; exists
    (resolve-all outer-query)))

(defn resolve-card-id-source-tables
  "Middleware that assocs the `:source-query` for this query if it was specified using the shorthand `:source-table`
  `card__n` format."
  [qp]
  (fn [query rff context]
    (qp (resolve-card-id-source-tables* query) rff context)))
