(ns metabase-enterprise.replacement.util
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn valid-query? :- :boolean
  [maybe-query :- :any]
  (mr/validate ::lib.schema/query maybe-query))
