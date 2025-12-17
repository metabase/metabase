(ns metabase.query-processor.middleware.constraints
  "Middleware that adds default constraints to limit the maximum number of rows returned to queries that specify the
  `:add-default-userland-constraints?` `:middleware` option."
  (:refer-clojure :exclude [get-in])
  (:require
   [metabase.query-processor.settings :as qp.settings]
   [metabase.util.performance :refer [get-in]]))

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
;;
;; If we turned the below `const`s into `:default`s on the settings themselves, we would use the default values for
;; all queries, whether or not the middleware was applied.
(def ^:private ^:const default-unaggregated-query-row-limit 2000)
(def ^:private ^:const default-aggregated-query-row-limit 10000)

(defn default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  []
  {:max-results           (or (qp.settings/aggregated-query-row-limit) default-aggregated-query-row-limit)
   :max-results-bare-rows (or (qp.settings/unaggregated-query-row-limit) default-unaggregated-query-row-limit)})

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
  (let [userland? (should-add-userland-constraints? query)]
    (cond-> query
      userland? add-constraints)))
