(ns metabase.lib.schema.filter
  "Schemas for the various types of filter clauses that you'd pass to `:filter` or use inside something else that takes
  a boolean expression."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::=
  [:catn
   [:clause [:= :=]]
   [:options ::common/options]
   ;; avoid circular refs between these namespaces.
   [:args [:+ {:min 2} :metabase.lib.schema.expression/equality-comparable]]])

(mr/def ::filter
  [:or
   ::=])
