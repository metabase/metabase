(ns metabase.mcp.v2.tools.parameters
  "The v2 MCP `get_parameter_values` tool: the valid values behind a dashboard or question filter.

   It can't ride `get_content` as an include — it takes its own arguments (a parameter id, a
   prefix `query`, chain-filter `constraints`) — so it is its own tool. Backed by the same
   functions the REST param-value endpoints call, under the same read check, so sandboxing and
   collection permissions apply unchanged.

   Two things the REST layer leaves implicit are made explicit here, before the backend call:
   an unknown `parameter_id` names the parameters that do exist, and a `constraints` key that
   isn't a dashboard parameter is rejected rather than silently dropped — a dropped constraint
   would return values the agent believes were filtered."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.dashboard :as parameters.dashboard]
   [metabase.parameters.params :as params]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private default-limit 100)

;; The backends cap at 1000 (`parameters.dashboard/result-limit`, `custom-values/*max-rows*`), so
;; a limit above it could never be filled.
(def ^:private max-limit 1000)

;;; ------------------------------------------------ Parameter lookup ----------------------------------------------

(defn- parameter-catalog
  "The `id (name)` list a teaching error names when a parameter id doesn't match."
  [params]
  (or (not-empty
       (str/join ", " (map (fn [{param-id :id param-name :name}]
                             (cond-> (u/qualified-name param-id)
                               (not (str/blank? param-name)) (str " (" param-name ")")))
                           params)))
      "none"))

(defn- check-parameter-id!
  [target parameter-id params]
  (when-not (some #(= parameter-id (u/qualified-name (:id %))) params)
    (common/throw-teaching-error
     (format "This %s has no parameter %s — pass one of its parameter ids (get_content returns them under `parameters`). Available: %s."
             target (pr-str parameter-id) (parameter-catalog params)))))

(defn- card-parameters
  "A card's parameters, falling back to its native template tags viewed as parameters — the same
   resolution [[metabase.queries.core/card-param-values]] performs."
  [card]
  (or (seq (:parameters card))
      (queries/card-template-tag-parameters card)))

;;; --------------------------------------------------- Fetching ---------------------------------------------------

(defn- check-constraints!
  [resolved-params constraints]
  (doseq [param-key (keys constraints)]
    (when-not (contains? resolved-params param-key)
      (common/throw-teaching-error
       (format "This dashboard has no parameter %s — each constraints key names another of its filters and the value is that filter's current selection. Available: %s."
               (pr-str param-key) (parameter-catalog (vals resolved-params)))))))

(defn- dashboard-values
  [id-or-eid parameter-id query constraints]
  (let [dash            (-> (common/resolve-and-read :model/Dashboard id-or-eid
                                                     (fn [id] (api/read-check (t2/select-one :model/Dashboard :id id))))
                            (t2/hydrate :resolved-params))
        resolved-params (:resolved-params dash)
        constraints     (update-keys constraints u/qualified-name)]
    (check-parameter-id! "dashboard" parameter-id (vals resolved-params))
    (check-constraints! resolved-params constraints)
    ;; `*param-values-query*` is what lets a caller who can read the dashboard look up its filter
    ;; values without query permission on the underlying table — the same grant the REST endpoints
    ;; make. The search path additionally pins remapping to the field actually being filtered
    ;; (#59020), as `GET …/params/:param-key/search/:query` does.
    (binding [qp.perms/*param-values-query* true]
      (if query
        (binding [chain-filter/*allow-implicit-uuid-field-remapping* false]
          (parameters.dashboard/param-values dash parameter-id constraints query))
        (parameters.dashboard/param-values dash parameter-id constraints)))))

(def ^:private no-values
  {:values [] :has_more_values false})

(defn- valueless-param?
  "True when a card parameter has nothing behind it to fetch values from: no values source, and no
   field under its target. A free-text template tag is the common case."
  [card param]
  (and (nil? (:values_source_type param))
       (nil? (params/param-target->field-id (:target param) card))))

(defn- question-values
  [id-or-eid parameter-id query]
  (let [card   (common/resolve-and-read :model/Card id-or-eid
                                        (fn [id] (api/read-check (t2/select-one :model/Card :id id))))
        params (card-parameters card)]
    (check-parameter-id! "question" parameter-id params)
    (let [param (some #(when (= parameter-id (u/qualified-name (:id %))) %) params)]
      ;; `card-param-values` answers nil for a valueless parameter, which its own output schema
      ;; rejects — so the tool decides this case rather than calling and catching.
      (if (valueless-param? card param)
        no-values
        (binding [qp.perms/*param-values-query* true]
          (queries/card-param-values card parameter-id query))))))

;;; --------------------------------------------------- Response ---------------------------------------------------

(defn- steering-line
  "The sentence appended when the page isn't the whole story. `total` is what the backend
   returned; `more?` marks it as a floor — the source held more than the backend's 1000-row cap."
  [{:keys [returned total more? offset limit]}]
  (cond
    (zero? total)
    "No values — nothing is configured behind this parameter (a free-text filter has no value list), or its source is empty."

    (zero? returned)
    (if more?
      (format "No values at offset %d — the source stopped at %d before returning everything; narrow with `query` rather than paging further."
              offset total)
      (format "No values at offset %d — %d available." offset total))

    :else
    (or (common/truncation-line {:param :query :offset offset :limit limit
                                 :total total :total-floor? more?})
        (when more?
          (format "Returned %d — the source holds more values than it will return; narrow with `query` to reach the rest."
                  returned)))))

(defn- values-content
  "Slice `limit`/`offset` out of the backend's value list and render the response. `has_more_values`
   stays true when the slice dropped values, not only when the backend hit its own cap — a page is
   never reported as the whole set."
  [{:keys [values has_more_values]} limit offset]
  (let [values   (vec values)
        total    (count values)
        page     (if (< offset total)
                   (subvec values offset (min total (+ offset limit)))
                   [])
        payload  {:values          page
                  :returned        (count page)
                  :has_more_values (boolean (or has_more_values (< (+ offset (count page)) total)))}
        line     (steering-line {:returned (count page) :total total :more? (boolean has_more_values)
                                 :offset offset :limit limit})]
    (common/success-content (cond-> (json/encode payload)
                              line (str "\n" line)))))

;;; --------------------------------------------------- The tool ---------------------------------------------------

(def ^:private get-parameter-values-args-schema
  [:map {:closed true}
   [:target [:enum {:description "Whether id names a dashboard or a card. \"question\" covers any card — question, model, or metric."}
             "dashboard" "question"]]
   [:id [:or
         [:int {:description "Numeric id."}]
         [:string {:min 1 :description "A 21-character entity_id."}]]]
   [:parameter_id
    [:string {:min 1 :description "The parameter's id, as returned by get_content under `parameters` — not its name or slug."}]]
   [:query {:optional true}
    [:maybe [:string {:min 1 :description "Return only values matching this search string. Use it to narrow a large value list."}]]]
   [:constraints {:optional true}
    [:maybe [:map-of {:description "Chain filtering: the current selections of the dashboard's OTHER filters, keyed by their parameter ids, narrowing this filter to the values still valid alongside them. Dashboards only."}
             :keyword :any]]]
   [:limit {:optional true}
    [:maybe [:int {:min 1 :max max-limit :description "Maximum values to return in this call (default 100, max 1000)."}]]]
   [:offset {:optional true}
    [:maybe [:int {:min 0 :description "Index of the first value to return (default 0) — continue a truncated response."}]]]])

(registry/deftool get-parameter-values
  "Fetch the valid values for one filter on a dashboard or a saved question, so you filter with real values instead of guessing them. Pass target (\"dashboard\" or \"question\" — \"question\" accepts any card id: question, model, or metric), id (numeric or 21-char entity_id), and parameter_id, which you get from get_content: a dashboard's `parameters` and a question's `parameters` each list `id`, `name`, and `type`. Values come back as [value] pairs, or [value, display_label] when the column is remapped — filter with the first element, show the second. Use query to search a large list rather than paging through it, and constraints (dashboards only) to chain-filter: pass the other filters' current selections keyed by their parameter ids and you get back only the values still valid alongside them. Paged with limit (default 100, max 1000) and offset. A parameter with nothing behind it — a free-text template tag, say — returns no values; a date parameter mapped to a column returns that column's distinct dates, which is rarely what you want, so build date ranges yourself rather than picking from them. Pair with run_saved_question, which takes these values as its `parameters`."
  {:name        "get_parameter_values"
   :scope       metabot.scope/agent-resource-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        get-parameter-values-args-schema}
  [{:keys [target id parameter_id query constraints limit offset]} _context]
  (when (and query (str/blank? query))
    (common/throw-teaching-error
     "`query` is the text to match, so it can't be blank — pass a search string, or omit `query` to list every value."))
  (when (and (seq constraints) (= target "question"))
    (common/throw-teaching-error
     "`constraints` chain-filters a dashboard's filters against each other, so it needs target: \"dashboard\" — a question's parameters are independent and take none."))
  (let [result (if (= target "dashboard")
                 (dashboard-values id parameter_id query constraints)
                 (question-values id parameter_id query))]
    ;; The card path still answers nil when a parameter's source card was archived and its target
    ;; has no field to fall back to; an empty value list is the honest answer there too.
    (values-content (or result no-values)
                    (or limit default-limit)
                    (or offset 0))))
