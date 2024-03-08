(ns metabase.query-processor.middleware.convert-to-legacy
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.mbql.schema :as mbql.s]
   [metabase.util.malli :as mu]))

(mu/defn convert-to-legacy :- mbql.s/Query
  "Middleware that converts and MLv2 query back to a legacy query. This is temporary until we concert the entire QP to
  use MLv2 everywhere."
  [query :- :map]
  (cond-> query
    (= (:lib/type query) :mbql/query) lib.convert/->legacy-MBQL))
