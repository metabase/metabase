(ns metabase-enterprise.replacement.swap.mbql
  (:require
   [metabase.lib-be.core :as lib-be]))

(set! *warn-on-reflection* true)

(defn swap-mbql-stages
  [query old-source new-source]
  (lib-be/swap-source-in-query query old-source new-source))
