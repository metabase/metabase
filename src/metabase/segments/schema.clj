(ns metabase.segments.schema
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli.registry :as mr]))

(mr/def ::definition
  "Schema for a segment's `:definition`; accepts a full MBQL query, converting legacy MBQL on decode."
  [:schema
   {:description (deferred-tru "value must be a valid MBQL query with a source table and filters.")}
   [:and
    ::lib-be.schema/maybe-legacy-query
    [:fn
     {:error/message (deferred-tru "a segment definition must be a single-stage query with a source table and filters, and without joins, expressions, breakouts, aggregations, fields, order by, or limit")}
     (fn [query]
       (and (= (lib/stage-count query) 1)
            (some? (lib/primary-source-table-id query))
            (seq (lib/filters query))
            (empty? (lib/joins query))
            (empty? (lib/expressions query))
            (empty? (lib/breakouts query))
            (empty? (lib/aggregations query))
            (empty? (lib/order-bys query))
            (nil? (lib/current-limit query))))]]])
