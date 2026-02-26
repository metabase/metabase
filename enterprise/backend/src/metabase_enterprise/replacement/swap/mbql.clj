(ns metabase-enterprise.replacement.swap.mbql
  (:require
   [metabase.lib-be.source-swap :as lib-be.source-swap]))

(defn swap-mbql-stages
  [query old-source new-source]
  (lib-be.source-swap/swap-source-in-query query old-source new-source))
