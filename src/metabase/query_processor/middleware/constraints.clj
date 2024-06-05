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
  :export?        true
  :type           :integer
  :database-local :allowed
  :audit          :getter
  :doc "Must be less than 1048575, and less than the number configured in MB_AGGREGATED_QUERY_ROW_LIMIT.
        This environment variable also affects how many rows Metabase returns in dashboard subscription attachments.
        See also MB_AGGREGATED_QUERY_ROW_LIMIT.")

(setting/defsetting aggregated-query-row-limit
  (deferred-tru "Maximum number of rows to return for aggregated queries via the API.")
  :visibility     :authenticated
  :export?        true
  :type           :integer
  :database-local :allowed
  :audit          :getter
  :doc "Must be less than 1048575. This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.
  This environment variable also affects how many rows Metabase includes in dashboard subscription attachments.
  See also MB_UNAGGREGATED_QUERY_ROW_LIMIT.")

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

(defn add-constraints
  "Add default values of `:max-results` and `:max-results-bare-rows` to `:constraints` map `m`."
  [query]
  (update query :constraints (comp ensure-valid-constraints merge-default-constraints)))

(defn- should-add-userland-constraints? [query]
  (and (get-in query [:middleware :userland-query?])
       (get-in query [:middleware :add-default-userland-constraints?])))

(defn maybe-add-default-userland-constraints
  "If the query is marked as requiring userland constraints, actually calculate the constraints and add them to the
  query."
  [query]
  (cond-> query
    (should-add-userland-constraints? query) add-constraints))
