(ns metabase.query-processor.util.add-alias-info.helpers
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.query-processor.util.add-alias-info :as-alias add]
   [metabase.util.malli :as mu]))

(mu/defn mbql-5-aggregation-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate aggregation name/alias *used inside a query* for an `:aggregation` subclause (an aggregation
  or expression). Takes an options map as schema won't support passing keypairs directly as a varargs.

  These names are also used directly in queries, e.g. in the equivalent of a SQL `AS` clause."
  [query        :- ::lib.schema/query
   stage-number :- :int
   ag-clause    :- ::lib.schema.mbql-clause/clause]
  (let [opts (lib/options ag-clause)]
    (or (::add/desired-alias opts)
        (:name opts)
        (lib/column-name query stage-number ag-clause))))
