(ns metabase.query-processor.middleware.add-source-metadata
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.api.common :as api]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s]))

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

(s/defn ^:private native-source-query->metadata :- (s/maybe [mbql.s/SourceQueryMetadata])
  "Given a `source-query`, return the source metadata that should be added at the parent level (i.e., at the same
  level where this `source-query` was present.) This metadata is used by other middleware to determine what Fields to
  expect from the source query."
  [{nested-source-metadata :source-metadata, :as source-query} :- mbql.s/SourceQuery]
  ;; If the source query has a nested source with metadata and does not change the fields that come back, return
  ;; metadata as-is
  (if (has-same-fields-as-nested-source? source-query)
    nested-source-metadata
    ;; Otherwise we cannot determine the metadata automatically; usually, this is because the source query itself has
    ;; a native source query
    (do
      (when-not qp.i/*disable-qp-logging*
        (log/warn
         (trs "Cannot infer `:source-metadata` for source query with native source query without source metadata.")
         {:source-query source-query}))
      nil)))

(s/defn ^:private mbql-source-query->metadata :- [mbql.s/SourceQueryMetadata]
  "Preprocess a `source-query` so we can determine the result columns."
  [source-query]
  (try
    (let [cols (binding [api/*current-user-id* nil]
                 ((resolve 'metabase.query-processor/query->expected-cols) {:database (:id (qp.store/database))
                                                                            :type     :query
                                                                            :query    source-query}))]
      (for [col cols]
        (select-keys col [:name :id :table_id :display_name :base_type :special_type :unit :fingerprint :settings])))
    (catch Throwable e
      (log/error e (str (trs "Error determining expected columns for query")))
      nil)))

(s/defn ^:private add-source-metadata :- {:source-metadata [mbql.s/SourceQueryMetadata], s/Keyword s/Any}
  [{{native-source-query? :native, :as source-query} :source-query, :as inner-query}]
  (let [metadata ((if native-source-query?
                     native-source-query->metadata
                     mbql-source-query->metadata) source-query)]
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

(defn- maybe-add-source-metadata [x]
  (if (and (map? x) (can-add-source-metadata? x))
    (add-source-metadata x)
    x))

(defn- add-source-metadata-at-all-levels [inner-query]
  (walk/postwalk maybe-add-source-metadata inner-query))

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
  (fn [query rff context]
    (qp (add-source-metadata-for-source-queries* query) rff context)))
