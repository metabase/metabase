(ns metabase.query-processor.metadata
  (:require
   [metabase.lib.convert.metadata :as lib.convert.metadata]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

(mu/defn ^:private ->mlv2-query :- ::lib.schema/query
  [query :- :map]
  (if (and (= (:lib/type query) :mbql/query)
           (lib.metadata.protocols/metadata-provider? (:lib/metadata query)))
    query
    (let [query (normalize/normalize-without-convering query)]
      (lib/query
       (qp.store/metadata-provider (:database query))
       query))))

(mu/defn ^:private query->mlv2-metadata
  "Fast version of [[query->expected-cols]] that uses MLv2 for column calculation. Leaves metadata with MLv2-style
  `:kebab-case` keys."
  [mlv2-query :- ::lib.schema/query]
  (-> mlv2-query lib.metadata.calculation/returned-columns vec))

(mu/defn legacy-metadata
  [mlv2-query :- ::lib.schema/query]
  (mapv (fn [col]
          (lib.convert.metadata/->legacy-column-metadata mlv2-query col))
        (query->mlv2-metadata mlv2-query)))

(mu/defn query->expected-cols
  "Return the `:cols` you would normally see in MBQL query results using MLv2. This only works for pure MBQL queries,
  since it does not actually run the queries. Native queries or MBQL queries with native source queries won't work,
  since we don't need the results.
  Converts MLv2-style metadata to legacy-style `:snake_case` keys.
  Check whether you can use [[metabase.query-processor.metadata/query->mlv2-metadata]] instead and consume MLv2-style metadata directly."
  [query :- :map]
  ;; work around all those dumb tests that save Cards with {} queries
  (when (seq query)
    (qp.store/with-store
      (legacy-metadata (->mlv2-query query)))))
