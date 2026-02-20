(ns metabase-enterprise.replacement.swap.mbql
  (:require
   [metabase.lib.query.field-ref-update :as lib.query.field-ref-update]))

(defn swap-mbql-stages
  [query old-source new-source]
  (lib.query.field-ref-update/update-field-refs query old-source new-source))


