(ns metabase.query-processor.middleware.constraints
  "Middleware that adds default constraints to limit the maximum number of rows returned to queries that specify the
  `:add-default-userland-constraints?` `:middleware` option.")

(def ^:private max-results-bare-rows
  "Maximum number of rows to return specifically on :rows type queries via the API."
  2000)

(def ^:private max-results
  "General maximum number of rows to return from an API query."
  10000)

(def default-query-constraints
  "Default map of constraints that we apply on dataset queries executed by the api."
  {:max-results           max-results
   :max-results-bare-rows max-results-bare-rows})

(defn- ensure-valid-constraints
  "`:max-results-bare-rows` must be less than or equal to `:max-results`, so if someone sets `:max-results` but not
  `:max-results-bare-rows` or sets an both but sets an invalid value for ``:max-results-bare-rows` use the same value
  for both. Otherwise the default bare rows value could end up being higher than the custom `:max-rows` value, causing
  an error."
  [{:keys [max-results max-results-bare-rows], :as constraints}]
  (if (<= max-results-bare-rows max-results)
    constraints
    (assoc constraints :max-results-bare-rows max-results)))

(defn- merge-default-constraints [constraints]
  (merge default-query-constraints constraints))

(defn- add-default-userland-constraints*
  "Add default values of `:max-results` and `:max-results-bare-rows` to `:constraints` map `m`."
  [{{:keys [add-default-userland-constraints?]} :middleware, :as query}]
  (cond-> query
    add-default-userland-constraints? (update :constraints (comp ensure-valid-constraints merge-default-constraints))))

(defn add-default-userland-constraints
  "Middleware that optionally adds default `max-results` and `max-results-bare-rows` constraints to queries, meant for
  use with `process-query-and-save-with-max-results-constraints!`, which ultimately powers most QP API endpoints."
  [qp]
  (fn [query rff context]
    (qp (add-default-userland-constraints* query) rff context)))
