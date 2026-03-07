(ns metabase-enterprise.replacement.util
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn valid-query? :- :boolean
  [maybe-query :- [:maybe :map]]
  (some? (seq (:stages maybe-query))))
