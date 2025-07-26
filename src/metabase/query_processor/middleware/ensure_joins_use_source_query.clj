(ns metabase.query-processor.middleware.ensure-joins-use-source-query
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn ensure-joins-use-source-query :- ::lib.schema/query
  "Super simple middleware to ensure that joins keep

    {:source-query {:source-table ...}}

  instead of getting automatically collapsed back to

    {:source-table ...}

  when the query is converted to legacy. The main reason we want to do this is
  so [[metabase.query-processor.middleware.add-implicit-clauses/add-implicit-clauses]] will add `:fields` to the
  join's `:source-query` so that [[metabase.query-processor.middleware.add-remaps/add-remapped-columns]] can add
  remaps as appropriate.

  Once we convert the `add-implicit-clauses` middleware to use Lib we can remove this middleware entirely."
  [query :- ::lib.schema/query]
  (lib.walk/walk
   (fn [_query path-type _path stage-or-join]
     (when (= path-type :lib.walk/join)
       (assoc-in stage-or-join [:stages (dec (count (:stages stage-or-join))) ::do-not-collapse] true)))
   query))
