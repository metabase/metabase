(ns metabase.query-processor.middleware.add-source-metadata
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]]
            [metabase.query-processor.middleware
             [add-implicit-clauses :as add-implicit-clauses]
             [annotate :as annotate]
             [pre-alias-aggregations :as pre-alias-ags]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]))

(s/defn ^:private mbql-source-query->metadata :- [mbql.s/SourceQueryMetadata]
  [{breakouts    :breakout
    aggregations :aggregation
    fields       :fields
    :as          source-query} :- mbql.s/SourceQuery]
  (let [field-ids (mbql.u/match (concat breakouts aggregations fields) [:field-id id] id)]
    (qp.store/fetch-and-store-fields! field-ids))
  (for [col (annotate/cols-for-mbql-query source-query)]
    (select-keys col [:name :id :table_id :display_name :base_type :special_type :unit :fingerprint :settings])))

(defn- has-same-fields-as-nested-source?
  "Whether this source query itself has a nested source query, and will have the exact same fields in the results as its
  nested source. If this is the case, we can return the `source-metadata` for the nested source as-is, if it is
  present."
  [{nested-source-query    :source-query
    nested-source-metadata :source-metadata
    breakouts              :breakout
    aggregations           :aggregation
    fields                 :fields}]
  (when nested-source-query
    (and (every? empty? [breakouts aggregations])
         (or (empty? fields)
             (and (= (count fields) (count nested-source-metadata))
                  (every? #(mbql.u/is-clause? :field-literal (mbql.u/unwrap-field-clause %)) fields))))))

(defn- can-determine-fields?
  "Whether we can determine the Fields that will come back in the results because at least one of `:breakout`,
  `:aggregation`, and/or `:fields` is present.

  When one or more of these is present, the QP will always return `breakouts + aggreagtions + fields`; if none are
  present, QP implementations fall back to the equivalent of `SELECT *`. Because we're calling
  `add-implicit-clauses/add-implicit-mbql-clauses` on the source query below, `:fields` should get added automatically
  to any MBQL source query or to any native source query with source metadata. Thus this should be true for every case
  except for native source queries with no source metadata, e.g.

    {:source-query {:native \"SELECT *\"}}"
  [{breakouts :breakout, aggregations :aggregation, fields :fields}]
  (some seq [breakouts aggregations fields]))

(s/defn ^:private source-query->metadata :- (s/maybe [mbql.s/SourceQueryMetadata])
  "Given a `source-query`, return the source metadata that should be added at the parent level (i.e., at the same
  level where this `source-query` was present.) This metadata is used by other middleware to determine what Fields to
  expect from the source query."
  [{nested-source-metadata :source-metadata, :as source-query} :- mbql.s/SourceQuery]
  (cond
    ;; If the source query has a nested source with metadata and does not change the fields that come back, return
    ;; metadata as-is
    (has-same-fields-as-nested-source? source-query)
    nested-source-metadata
    ;;
    ;; otherwise if this query has at least one of `:breakout`, `:aggregation`, or `:fields`, the results are
    ;; determinate and we can generate appropriate metadata about the Fields that we can expect in the results
    (can-determine-fields? source-query)
    (mbql-source-query->metadata source-query)
    ;;
    ;; Otherwise we cannot determine the metadata automatically; usually, this is because the source query itself
    ;; has a native source query
    :else
    (do
      (when-not qp.i/*disable-qp-logging*
        (log/warn
         (trs "Cannot infer `:source-metadata` for source query with native source query without source metadata.")
         {:source-query source-query}))
      nil)))

(defn- partially-preprocess-source-query
  "Unfortunately there are a few middleware transformations that would normally come later but need to be done here for
  nested source queries before proceeding. This middleware applies those transformations.

  TODO - in a nicer world there would be no need to do such things. It defeats the purpose of having distinct
  middleware stages."
  [source-query]
  (-> source-query
      pre-alias-ags/pre-alias-aggregations-in-inner-query
      add-implicit-clauses/add-implicit-mbql-clauses))

(s/defn ^:private add-source-metadata :- {:source-metadata [mbql.s/SourceQueryMetadata], s/Keyword s/Any}
  [{{native-source-query? :native, :as source-query} :source-query, :as inner-query}]
  (let [source-query (if native-source-query?
                       source-query
                       (partially-preprocess-source-query source-query))
        metadata     (source-query->metadata source-query)]
    (assoc inner-query :source-metadata metadata)))

(defn- can-add-source-metadata?
  "Can we add `:source-metadata` about the `:source-query` in this map? True if all of the following are true:

  *  The map (e.g. an 'inner' MBQL query or a Join) has a `:source-query`
  *  The `:source-query` is an MBQL query, or a native source query with `:source-metadata`"
  [{{native-source-query?              :native
     source-query-has-source-metadata? :source-metadata
     :as                               source-query} :source-query
    :keys                                            [source-metadata]}]
  (and source-query
       (not source-metadata)
       (or (not native-source-query?)
           source-query-has-source-metadata?)))

(defn- add-source-metadata-at-all-levels [inner-query]
  (walk/postwalk
   #(if-not ((every-pred map? can-add-source-metadata?) %)
      %
      (add-source-metadata %))
   inner-query))

(defn- add-source-metadata-for-source-queries* [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (update query :query add-source-metadata-at-all-levels)))

(defn add-source-metadata-for-source-queries
  "Middleware that attempts to recursively add `:source-metadata`, if not already present, to any maps with a
  `:source-query`.

  `:source-metadata` is information about the columns we can expect to come back from the source
  query; this is added automatically for source queries added via the `card__id` source table form, but for *explicit*
  source queries that do not specify this information, we can often infer it by looking at the shape of the source
  query."
  [qp]
  ;; this middleware works as both sync and async style to make our lives easier when we convert the QP to full async
  (fn
    ([query]
     (qp (add-source-metadata-for-source-queries* query)))

    ([query respond raise canceled-chan]
     (when-let [query (try
                        (add-source-metadata-for-source-queries* query)
                        (catch Throwable e
                          (raise e)
                          nil))]
       (qp query respond raise canceled-chan)))))
