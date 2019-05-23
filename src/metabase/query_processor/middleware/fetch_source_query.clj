(ns metabase.query-processor.middleware.fetch-source-query
  "Middleware responsible for 'hydrating' the source query for queries that use another query as their source. This
  middleware looks for MBQL queries like

    {:source-table \"card__1\" ; Shorthand for using Card 1 as source query
     ...}

  and resolves the referenced source query, transforming the query to look like the following:

    {:source-query {...} ; Query for Card 1
     ...}

  TODO - consider renaming this namespace to `metabase.query-processor.middleware.resolve-card-id-source-tables`"
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.mbql
             [normalize :as normalize]
             [schema :as mbql.s]]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [schema.core :as s]
            [toucan.db :as db]
            [metabase.util.schema :as su]
            [metabase.mbql.util :as mbql.u]
            [medley.core :as m]))

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

(defn- has-unresolved-card-id-source-tables? [m]
  (when m
    (mbql.u/match-one m
      (&match :guard (every-pred map? (comp string? :source-table))))))

(def ^:private FullyResolvedQuery
  (s/constrained
   mbql.s/Query
   (complement (comp has-unresolved-card-id-source-tables? :query))
   "Query where all card__id :source-tables are fully resolved"))


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
