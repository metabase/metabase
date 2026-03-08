(ns metabase-enterprise.replacement.source-swap.mbql
  (:require
   [metabase.lib-be.core :as lib-be]))

(set! *warn-on-reflection* true)

(defn swap-mbql-stages
  "Swap field references in MBQL stages from old-source to new-source."
  [query old-source new-source]
  (lib-be/swap-source-in-query query old-source new-source))
