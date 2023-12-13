(ns metabase.query-processor.middleware.constraints
  "Middleware that adds default constraints to limit the maximum number of rows returned to queries that specify the
  `:add-default-userland-constraints?` `:middleware` option."
  (:require
   [metabase.models.setting :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

;; The following "defaults" are not applied to the settings themselves - why not? Because the existing behavior is
;; that, if you manually update the settings, queries are affected *WHETHER OR NOT* the
;; `add-default-userland-constraints` middleware was applied.
;;
;; To achieve this, the QP looks for the following, in order:
;; 1. a non-nil value set by the `add-default-userland-constraints` middleware below, either:
;;    a) the value of the setting (if it's set),
;;    b) the "default" value from the constant below, or
;;    c) `nil` if the constraint middleware was not applied
;; 2. a non-nil value for the appropriate setting (for aggregated vs. unaggregated queries) itself, either:
;;    a) the value of the setting, or
;;    b) `nil` if the setting is not set
;; 3. the value of `absolute-max-results`
;;
;; If we turned the below `const`s into `:default`s on the settings themselves, we would use the default values for
;; all queries, whether or not the middleware was applied.
(def ^:private ^:const default-unaggregated-query-row-limit 2000)
(def ^:private ^:const default-aggregated-query-row-limit 10000)

;; NOTE: this was changed from a hardcoded var with value of 2000 (now moved to [[default-unaggregated-query-row-limit]])
;; to a setting in 0.43 the setting, which allows for DB local value, can still be nil, so any places below that used
;; to reference the former constant value have to expect it could return nil instead
(setting/defsetting unaggregated-query-row-limit
  (deferred-tru "Maximum number of rows to return specifically on :rows type queries via the API.")
  :visibility     :authenticated
  :type           :integer
  :database-local :allowed
  :audit          :getter)

(setting/defsetting aggregated-query-row-limit
  (deferred-tru "Maximum number of rows to return for aggregated queries via the API.")
  :visibility     :authenticated
  :type           :integer
  :database-local :allowed
  :audit          :getter)

(defn query->max-rows
  "Given a query, returns the max rows that should be returned *as defined by settings*. In other words,
  return `(aggregated-query-row-limit)` or `(unaggregated-query-row-limit)` depending on whether the query is
  aggregated or not."
  [{{aggregations :aggregation} :query}]
  (if-not aggregations
    (unaggregated-query-row-limit)
    (aggregated-query-row-limit)))

(defn default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  []
  {:max-results           (or (aggregated-query-row-limit) default-aggregated-query-row-limit)
   :max-results-bare-rows (or (unaggregated-query-row-limit) default-unaggregated-query-row-limit)})

(defn- ensure-valid-constraints
  "Clamps the value of `max-results-bare-rows` to be less than or equal to the value of `max-results`."
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
