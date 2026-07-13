(ns metabase.agent-api.parameter-values
  "The v2 `get_parameter_values` tool: the values a dashboard or question filter accepts.

   A parameter is the one thing an agent cannot guess. `get_content` says a dashboard has a `Category` filter; it
   cannot say that the warehouse spells it `Doohickey` rather than `doohickeys`, and a run with the wrong spelling
   comes back empty and looks like an answer. So the values come from the same chain-filter engine the app's filter
   widget reads — dependent filters included, which is why the tool takes `constraints` rather than being an `include`
   on `get_content`.

   Its response is the REST shape verbatim: `{values, has_more_values}`, values as `[value]` or
   `[value, remapped-label]` pairs."
  (:require
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def targets
  "Every `target` the tool accepts."
  ["dashboard" "question"])

(defn- dashboard-values
  "The dashboard's values for one parameter, chain-filtered by the values already chosen for the others. The bindings
   are the ones `GET /api/dashboard/:id/params/:key/values` uses: a parameter-values query is not a data-permission
   query, and a prefix search never remaps implicitly (the caller asked for values, not for labels)."
  [id parameter-id query constraints]
  (let [dashboard (api/read-check :model/Dashboard (tools/resolve-id :model/Dashboard id))]
    (binding [qp.perms/*param-values-query*                     true
              chain-filter/*allow-implicit-uuid-field-remapping* (nil? query)]
      (parameters.dashboard/param-values dashboard parameter-id (or constraints {}) query))))

(defn- question-values
  [id parameter-id query]
  (let [card (api/read-check :model/Card (tools/resolve-id :model/Card id))]
    (binding [qp.perms/*param-values-query* true]
      (queries/card-param-values card parameter-id query))))

(defn- values-for
  "The values `target` gives for one parameter. A refusal from the engine — the id names no parameter of this
   dashboard or question — also says where the ids come from, because an agent that guessed once will guess again."
  [{:keys [target id parameter_id query constraints]}]
  (try
    (case target
      "dashboard" (dashboard-values id parameter_id query constraints)
      "question"  (question-values id parameter_id query))
    (catch clojure.lang.ExceptionInfo e
      (if (= 400 (:status-code (ex-data e)))
        (tools/teaching-error
         (tru "{0} `get_content(type: \"{1}\", id: <id>, include: [\"parameters\"])` lists the parameters and their ids."
              (ex-message e) target))
        (throw e)))))

(defn get-parameter-values
  "Run the `get_parameter_values` tool. See the tool's description on `POST /v2/parameter-values` for the argument
   contract."
  [{:keys [target constraints] :as params}]
  (when (and (seq constraints) (= "question" target))
    (tools/teaching-error
     (tru "`constraints` chain-filter the parameters of a dashboard against each other; the parameters of a question are independent, so it takes none. Drop `constraints`, or target the dashboard the question sits on.")))
  (tools/project "concise" (projections/spec :parameter-values) (values-for params)))
