(ns metabase.query-processor.middleware.annotate.legacy-helper-fns
  "Helper functions that used to live in the old implementation of [[metabase.query-processor.middleware.annotate]]
  that no longer do since we rewrote it to use MLv2. These were used by various drivers for various nefarious purposes.

  I'm keeping them around for now so drivers can continue to use them until we work on converting drivers to MLv2 (at
  which point they can use MLv2 directly)."
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn legacy-inner-query->mlv2-query :- ::lib.schema/query
  "Convert a legacy `inner-query` to an MLv2 query. Requires bound QP store."
  [inner-query :- :map]
  (qp.store/cached [:mlv2-query (hash inner-query)]
    (try
      (lib/query-from-legacy-inner-query
       (qp.store/metadata-provider)
       (:id (lib.metadata/database (qp.store/metadata-provider)))
       (mbql.normalize/normalize-fragment [:query] inner-query))
      (catch Throwable e
        (throw (ex-info (tru "Error converting query to pMBQL: {0}" (ex-message e))
                        {:inner-query inner-query, :type qp.error-type/qp}
                        e))))))

(mu/defn aggregation-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate aggregation name/alias *used inside a query* for an `:aggregation` subclause (an aggregation
  or expression). Takes an options map as schema won't support passing keypairs directly as a varargs.

  These names are also used directly in queries, e.g. in the equivalent of a SQL `AS` clause."
  [legacy-inner-query :- :map
   legacy-ag-clause]
  (lib/column-name
   (legacy-inner-query->mlv2-query legacy-inner-query)
   (lib/->pMBQL legacy-ag-clause)))

(mu/defn merged-column-info :- :metabase.query-processor.middleware.annotate/cols
  "Returns deduplicated and merged column metadata (`:cols`) for query results by combining (a) the initial results
  metadata returned by the driver's impl of `execute-reducible-query` and (b) column metadata inferred by logic in
  this namespace."
  [legacy-query {initial-cols :cols, :as _initial-metadata} :- [:maybe :map]]
  (let [expected-cols (requiring-resolve 'metabase.query-processor.middleware.annotate/expected-cols)
        mlv2-query    (lib/query
                       (qp.store/metadata-provider)
                       ;; if this query has a `:native` query added to it already then remove that so we don't get
                       ;; schema validation errors
                       (cond-> legacy-query
                         ((every-pred :native :query) legacy-query)
                         (dissoc :native)))]
    (expected-cols mlv2-query initial-cols)))
