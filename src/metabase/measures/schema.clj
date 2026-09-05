(ns metabase.measures.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::definition
  "Schema for a measure's `:definition`; accepts a full MBQL query, converting legacy MBQL on decode."
  [:schema
   {:description (deferred-tru "value must be a valid MBQL query with a source table.")}
   [:and
    ::lib-be.schema/maybe-legacy-query
    [:fn
     {:error/message (deferred-tru "measure definition must have a source table")}
     #(some? (lib/primary-source-table-id %))]]])
