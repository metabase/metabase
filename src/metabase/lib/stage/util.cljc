(ns metabase.lib.stage.util
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.util.malli :as mu]))

;; lbrdnk TODO: Following function is the duplicate of `metabase.lib.stage/append-stage`. The original should be removed
;;              in favor of this implementation because util namespaces should contain least dependencies (as this
;;              function does) to help avoid circular dependencies (that is what this move actually helps with).
(mu/defn append-stage :- ::lib.schema/query
  "Adds a new blank stage to the end of the pipeline."
  [query]
  (update query :stages conj {:lib/type :mbql.stage/mbql}))
