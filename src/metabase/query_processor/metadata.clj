(ns metabase.query-processor.metadata
  (:require
   [clojure.string :as str]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.convert.metadata :as lib.convert.metadata]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.query-processor.middleware.normalize-query :as normalize]
   [metabase.query-processor.store :as qp.store]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- resolve-database
  ([mlv2-query]
   (resolve-database mlv2-query '()))

  ([mlv2-query already-seen]
   (if-not (= (:database mlv2-query) lib.schema.id/saved-questions-virtual-database-id)
     mlv2-query
     (let [source-card-id (lib.util/source-card-id mlv2-query)]
       (when (contains? (set already-seen) source-card-id)
         (throw (ex-info (i18n/tru "Circular source Card references: {0}"
                                   (str/join " -> " (cons source-card-id already-seen)))
                         {:card-ids (cons source-card-id already-seen)})))
       (assert source-card-id "Cannot use the saved-questions-virtual-database-id unless query has a :source-card")
       (assoc mlv2-query :database (let [card (lib.metadata/card mlv2-query source-card-id)]
                                     (or (:database-id card)
                                         (resolve-database (lib/query mlv2-query (:dataset-query card))
                                                           (cons source-card-id already-seen)))))))))

(mu/defn ^:private ->mlv2-query :- ::lib.schema/query
  [query :- :map]
  (if (and (= (:lib/type query) :mbql/query)
           (lib.metadata.protocols/metadata-provider? (:lib/metadata query)))
    query
    (let [query (-> query
                    normalize/normalize-without-convering
                    lib.convert/->pMBQL
                    (assoc :lib/metadata (qp.store/metadata-provider))
                    resolve-database)]
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

(mu/defn query->expected-cols :- [:maybe [:sequential lib.convert.metadata/LegacyColumn]]
  "Return the `:cols` you would normally see in MBQL query results using MLv2. This only works for pure MBQL queries,
  since it does not actually run the queries. Native queries or MBQL queries with native source queries won't work,
  since we don't need the results.
  Converts MLv2-style metadata to legacy-style `:snake_case` keys.
  Check whether you can use [[metabase.query-processor.metadata/query->mlv2-metadata]] instead and consume MLv2-style metadata directly."
  [query :- :map]
  ;; work around all those dumb tests that save Cards with {} queries
  (when (seq query)
    (qp.store/with-store
      (-> query ->mlv2-query legacy-metadata))))
