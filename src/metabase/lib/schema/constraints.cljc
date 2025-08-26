(ns metabase.lib.schema.constraints
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::constraints
  "Additional constraints added to a query limiting the maximum number of rows that can be returned. Mostly useful
  because native queries don't support the MBQL `:limit` clause. For MBQL queries, if `:limit` is set, it will
  override these values."
  [:and
   [:map
    {:decode/normalize lib.schema.common/normalize-map}
    [:max-results
     {:optional true
      :description
      "Maximum number of results to allow for a query with aggregations. If `max-results-bare-rows` is unset, this
  applies to all queries"}
     ::lib.schema.common/int-greater-than-or-equal-to-zero]

    [:max-results-bare-rows
     {:optional true
      :description
      "Maximum number of results to allow for a query with no aggregations. If set, this should be LOWER than
  `:max-results`."}
     ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   [:fn
    {:error/message "max-results-bare-rows must be less than or equal to max-results"}
    (fn [{:keys [max-results max-results-bare-rows]}]
      (if-not (and max-results max-results-bare-rows)
        true
        (>= max-results max-results-bare-rows)))]])
