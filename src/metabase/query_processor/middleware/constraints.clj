(ns metabase.query-processor.middleware.constraints
  "Middleware that adds default constraints to limit the maximum number of rows returned to queries that specify the
  `:add-default-userland-constraints?` `:middleware` option."
  (:require
   [metabase.models.setting :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(def ^:private ^:const default-max-unaggregated-query-row-limit 2000)
(def ^:private ^:const default-max-aggregated-query-row-limit 10000)

;; NOTE: this was changed from a hardcoded var with value of 2000 (now moved to [[default-max-unaggregated-query-row-limit]])
;; to a setting in 0.43 the setting, which allows for DB local value, can still be nil, so any places below that used
;; to reference the former constant value have to expect it could return nil instead
(setting/defsetting max-unaggregated-query-row-limit
  (deferred-tru "Maximum number of rows to return specifically on :rows type queries via the API.")
  :visibility     :authenticated
  :type           :integer
  :database-local :allowed
  :audit          :getter)

(setting/defsetting max-aggregated-query-row-limit
  (deferred-tru "Maximum number of rows to return for aggregated queries via the API.")
  :visibility     :authenticated
  :type           :integer
  :database-local :allowed
  :audit          :getter)

(defn query->max-rows
  "Given a query, returns the max rows that should be returned *as defined by settings*. In other words,
  return `(max-aggregated-query-row-limit)` or `(max-unaggregated-query-row-limit)` depending on whether the query is
  aggregated or not."
  [{{aggregations :aggregation} :query}]
  (if-not aggregations
    (max-unaggregated-query-row-limit)
    (max-aggregated-query-row-limit)))

(defn default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  []
  {:max-results           (or (max-aggregated-query-row-limit) default-max-aggregated-query-row-limit)
   :max-results-bare-rows (or (max-unaggregated-query-row-limit) default-max-unaggregated-query-row-limit)})

(defn- ensure-valid-constraints
  "`:max-unaggregated-query-row-limit` must be less than or equal to `:max-results`, so if someone sets `:max-results`
  but not `:max-unaggregated-query-row-limit` or sets an both but sets an invalid value for
  ``:max-unaggregated-query-row-limit` use the same value for both. Otherwise the default bare rows value could end up
  being higher than the custom `:max-rows` value, causing an error."
  [{:keys [max-results max-results-bare-rows], :as constraints}]
  (if (<= max-results-bare-rows max-results)
    constraints
    (assoc constraints :max-results-bare-rows max-results)))

(defn- merge-default-constraints [constraints]
  (merge (default-query-constraints) constraints))

(defn- add-default-userland-constraints*
  "Add default values of `:max-results` and `:max-results-bare-rows` to `:constraints` map `m`."
  [{{:keys [add-default-userland-constraints?]} :middleware, :as query}]
  (cond-> query
    add-default-userland-constraints? (update :constraints (comp ensure-valid-constraints merge-default-constraints))))

(defn add-default-userland-constraints
  "Middleware that optionally adds default `max-results` and `max-results-bare-rows` constraints to queries, meant for
  use with [[metabase.query-processor/process-query-and-save-with-max-results-constraints!]], which ultimately powers
  most QP API endpoints."
  [qp]
  (fn [query rff context]
    (qp (add-default-userland-constraints* query) rff context)))
