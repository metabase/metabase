(ns metabase.funnysql.sandbox
  "Rewrites app-DB queries to read some tables in place of others and keep only some rows of some tables."
  (:require
   [metabase.funnysql.schema :as funnysql.schema]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn sandbox-query :- ::funnysql.schema/query
  "`query` rewritten to read each table of `:table-substitutions` in place of its key and to see, update and delete
  only the rows of each table of `:row-filters` whose column holds its value, which for now returns `query` as it is."
  [query :- ::funnysql.schema/query
   _opts :- ::funnysql.schema/sandbox.options]
  query)
