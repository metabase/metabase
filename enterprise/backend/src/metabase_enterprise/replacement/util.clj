(ns metabase-enterprise.replacement.util
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn valid-query? :- :boolean
  "Returns true if `maybe-query` has at least one stage."
  [maybe-query :- [:maybe :map]]
  (some? (seq (:stages maybe-query))))
