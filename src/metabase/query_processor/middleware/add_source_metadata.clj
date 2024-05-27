(ns metabase.query-processor.middleware.add-source-metadata
  (:require
   [clojure.walk :as walk]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.interface :as qp.i]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

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
                  (every? #(lib.util.match/match-one % [:field (_ :guard string?) _])
                          fields))))))

(mu/defn ^:private native-source-query->metadata :- [:maybe [:sequential mbql.s/SourceQueryMetadata]]
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
        (log/warn "Cannot infer `:source-metadata` for source query with native source query without source metadata."
                  {:source-query source-query}))
      nil)))

(mu/defn mbql-source-query->metadata :- [:maybe [:sequential mbql.s/SourceQueryMetadata]]
  "Preprocess a `source-query` so we can determine the result columns."
  [source-query :- mbql.s/MBQLQuery]
  (try
    (let [cols (binding [api/*current-user-id* nil]
                 ((requiring-resolve 'metabase.query-processor.preprocess/query->expected-cols)
                  {:database (:id (lib.metadata/database (qp.store/metadata-provider)))
                   :type     :query
                   ;; don't add remapped columns to the source metadata for the source query, otherwise we're going
                   ;; to end up adding it again when the middleware runs at the top level
                   :query    (assoc-in source-query [:middleware :disable-remaps?] true)}))]
      (for [col cols]
        (select-keys col [:name :id :table_id :display_name :base_type :effective_type :coercion_strategy
                          :semantic_type :unit :fingerprint :settings :source_alias :field_ref :nfc_path :parent_id])))
    (catch Throwable e
      (log/errorf e "Error determining expected columns for query: %s" (ex-message e))
      nil)))

(mu/defn ^:private add-source-metadata :- [:map
                                           [:source-metadata
                                            {:optional true}
                                            [:maybe [:sequential mbql.s/SourceQueryMetadata]]]]
  [{{native-source-query? :native, :as source-query} :source-query, :as inner-query} :- :map]
  (let [metadata ((if native-source-query?
                     native-source-query->metadata
                     mbql-source-query->metadata) source-query)]
    (cond-> inner-query
      (seq metadata) (assoc :source-metadata metadata))))

(defn- legacy-source-metadata?
  "Whether this source metadata is *legacy* source metadata from < 0.38.0. Legacy source metadata did not include
  `:field_ref` or `:id`, which made it hard to correctly construct queries with. For MBQL queries, we're better off
  ignoring legacy source metadata and using [[metabase.query-processor.preprocess/query->expected-cols]] to infer the
  source metadata rather than relying on old stuff that can produce incorrect queries. See #14788 for more
  information."
  [source-metadata]
  (and (seq source-metadata)
       (every? nil? (map :field_ref source-metadata))))

(defn- should-add-source-metadata?
  "Should we add `:source-metadata` about the `:source-query` in this map? True if all of the following are true:

  * The map (e.g. an 'inner' MBQL query or a Join) has a `:source-query`

  * The map does not *already* have `:source-metadata`, or the `:source-metadata` is 'legacy' source metadata from
    versions < 0.38.0

  * The `:source-query` is an MBQL query, or a native source query with `:source-metadata`"
  [{{native-source-query?              :native
     source-query-has-source-metadata? :source-metadata
     :as                               source-query} :source-query
    :keys                                            [source-metadata]}]
  (and source-query
       (or (not source-metadata)
           (legacy-source-metadata? source-metadata))
       (or (not native-source-query?)
           source-query-has-source-metadata?)))

(defn- maybe-add-source-metadata [x]
  (if (and (map? x) (should-add-source-metadata? x))
    (add-source-metadata x)
    x))

(defn- add-source-metadata-at-all-levels [inner-query]
  (walk/postwalk maybe-add-source-metadata inner-query))

(defn add-source-metadata-for-source-queries
  "Middleware that attempts to recursively add `:source-metadata`, if not already present, to any maps with a
  `:source-query`.

  `:source-metadata` is information about the columns we can expect to come back from the source
  query; this is added automatically for source queries added via the `card__id` source table form, but for *explicit*
  source queries that do not specify this information, we can often infer it by looking at the shape of the source
  query."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (update query :query add-source-metadata-at-all-levels)))
