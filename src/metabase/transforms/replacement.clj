(ns metabase.transforms.replacement
  "The functions of the replacement spec of a Transform."
  (:require
   [metabase.replacement.core :as replacement]
   [metabase.source-swap.core :as source-swap]))

(set! *warn-on-reflection* true)

(defn upgrade-field-refs
  "The writes that upgrade the field refs of the query of `transform`, when its source is a query."
  [transform]
  (let [source (:source transform)
        query  (:query source)]
    (if (and (= :query (:type source))
             (replacement/valid-query? query))
      (let [query' (source-swap/upgrade-field-refs-in-query query)]
        (if (not= query query')
          [[:model/Transform (:id transform) {:source (assoc source :query query')}]]
          []))
      [])))

(defn swap-source
  "The writes that swap `old-source` for `new-source` in the query of `transform`, or nil when it has no valid query."
  [transform old-source new-source]
  (when-let [query (get-in transform [:source :query])]
    (when (replacement/valid-query? query)
      (let [query' (source-swap/swap-source-in-query query old-source new-source)]
        (if (not= query query')
          [[:model/Transform (:id transform) {:source (assoc (:source transform) :query query')}]]
          [])))))
