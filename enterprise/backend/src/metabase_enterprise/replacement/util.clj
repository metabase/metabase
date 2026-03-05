(ns metabase-enterprise.replacement.util
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mu/defn valid-query? :- :boolean
  [maybe-query :- [:maybe :map]]
  (mr/validate ::lib.schema/query maybe-query))
