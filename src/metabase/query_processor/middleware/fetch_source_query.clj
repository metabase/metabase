(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries like

    {:source-table \"card__1\" ; Shorthand for using Card 1 as source query
     ...}

  and resolves the referenced source query, transforming the query to look like the following:

    {:source-query {...}    ; Query for Card 1
     :source-metadata [...] ; metadata about columns in Card 1
     ...}

  This middleware resolves Card ID `:source-table`s at all levels of the query, but the top-level query often uses the
  so-called `virtual-id`, because the frontend client might not know the original Database; this middleware will
  replace that ID with the approiate ID, e.g.

    {:database <virtual-id>, :type :query, :query {:source-table \"card__1\"}}
    ->
    {:database 1, :type :query, :query {:source-query {...}, :source-metadata {...}}}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require [clojure.string :as str]
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
            [toucan.db :as db]))

;; These next two schemas are for validating the intermediate stages of the middleware. We don't need to validate the
;; entire query
(def ^:private SourceQueryWithMetadata
  (s/constrained
   mbql.s/SourceQuery
   (every-pred #(contains? % :database) #(contains? % :source-metadata))
   "Source query with `:database` and `:source-metadata` metadata"))

(def ^:private MapWithResolvedSourceQuery
  (s/constrained
   {:source-metadata s/Any
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

(s/defn ^:private trim-query :- su/NonBlankString
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

(s/defn ^:private card-id->source-query :- SourceQueryWithMetadata
  "Return the source query info for Card with `card-id`."
  [card-id :- su/IntGreaterThanZero]
  (let [card
        (or (db/select-one [Card :dataset_query :database_id :result_metadata] :id card-id)
            (throw (Exception. (str (tru "Card {0} does not exist." card-id)))))

        {{mbql-query :query, {native-query :query, template-tags :template-tags} :native} :dataset_query
         result-metadata                                                                  :result_metadata
         database-id                                                                      :database_id}
        card

        source-query
        (or mbql-query
            (when native-query
              (cond-> {:native (trim-query card-id native-query)}
                (seq template-tags) (assoc :template-tags template-tags)))
            (throw (Exception. (str (tru "Missing source query in Card {0}" card-id)))))]
    (assoc source-query
      ;; include database ID as well; we'll pass that up the chain so it eventually gets put in its spot in the
      ;; outer-query
      :database        database-id
      :source-metadata (normalize/normalize-fragment [:source-metadata] result-metadata))))

(s/defn ^:private source-table-str->source-query :- SourceQueryWithMetadata
  "Given a `source-table-str` like `card__100` return the appropriate source query."
  [source-table-str :- mbql.s/source-table-card-id-regex]
  (let [[_ card-id-str] (re-find #"^card__(\d+)$" source-table-str)]
    (u/prog1 (card-id->source-query (Integer/parseInt card-id-str))
      (when-not i/*disable-qp-logging*
        (log/info (trs "Fetched source query from Card {0}:" card-id-str)
                  "\n"
                  ;; No need to include result metadata here, it can be large and will clutter the logs
                  (u/pprint-to-str 'yellow (dissoc <> :result_metadata)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         Logic for traversing the query                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private ^{:arglists '([x])} map-with-card-id-source-table?
  "Is `x` a map with a \"card__id\" `:source-table`, i.e., something this middleware needs to resolve?"
  (every-pred
   map?
   (comp string? :source-table)
   (comp (partial re-matches mbql.s/source-table-card-id-regex) :source-table)))

(def ^:private ^{:arglists '([m])} is-join?
  "Whether this map is a Join (as opposed to an 'inner' MBQL query -- either can have a Card ID `:source-table`)."
  ;; a Join will always have `:condition`, whereas a MBQL query will not
  :condition)

(s/defn ^:private resolve-card-id-source-table :- MapWithResolvedSourceQuery
  [{:keys [source-table], :as m} :- {:source-table mbql.s/source-table-card-id-regex, s/Keyword s/Any}]
  (let [{:keys [database source-metadata], :as source-query} (source-table-str->source-query source-table)]
    (merge
     (dissoc m :source-table)
     {:source-query    (dissoc source-query :database :source-metadata)
      :source-metadata source-metadata}
     (when-not (is-join? m)
       {:database database}))))

(s/defn ^:private resolve-all :- su/Map
  [m :- su/Map]
  (mbql.u/replace m
    map-with-card-id-source-table?
    ;; if this is a map that has a Card ID `:source-table`, resolve that (replacing it with the appropriate
    ;; `:source-query`, then
    (recur (cond-> (resolve-card-id-source-table &match)
             (seq &parents) (dissoc :database)))))

(s/defn ^:private resolve-card-id-source-tables* :- FullyResolvedQuery
  [{inner-query :query, :as outer-query} :- mbql.s/Query]
  (if-not inner-query
    ;; for non-MBQL queries there's nothing to do since they have nested queries
    outer-query
    ;; Otherwise attempt to expand any source queries as needed. Pull the `:database` key up into the top-level if it
    ;; exists
    (let [{{:keys [database]} :query, :as outer-query} (update outer-query :query resolve-all)]
      (-> outer-query
          (m/dissoc-in [:query :database])
          (merge (when database {:database database}))))))

(defn resolve-card-id-source-tables
  "Middleware that assocs the `:source-query` for this query if it was specified using the shorthand `:source-table`
  `card__n` format."
  [qp]
  (comp qp resolve-card-id-source-tables*))
