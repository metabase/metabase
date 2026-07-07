(ns metabase.metabot.tools.metric-math
  "Metabot tool for building a \"metric math\" visualization: an arithmetic formula combining saved
  metrics/measures (`+ - * /`), optionally broken out by a shared dimension.

  The tool does NOT execute the query. It resolves the LLM's structured expression into an internal
  metric definition, validates it by compiling a query plan (no execution) and permission-checking
  every referenced metric/measure, then emits a `metric_viz` data part carrying the validated
  definition. The frontend renders the result by posting that definition to POST /api/metric/dataset
  (the same engine the metrics-viewer uses). See [[metabase.metrics.definition]] and
  [[metabase.lib-metric.projection/project-breakout-by-field-id]]."
  (:require
   [metabase.lib-metric.core :as lib-metric]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metrics.definition :as metrics.definition]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;; Canonical set lives in `metabase.lib-metric.operators/arithmetic-operator-keywords`; kept local here
;; to avoid depending on a non-API lib-metric namespace. Mirrors the operators in `expression-json-schema`.
(def ^:private math-operators #{:+ :- :* :/})

;;; ------------------------------------------------ Schema ------------------------------------------------

(def ^:private expression-json-schema
  "Hand-authored JSON Schema for the recursive `:expression` argument, attached to a deliberately-open
  malli `:map` via a `:json-schema` override (mirrors `construct_notebook_query`). It only shapes what
  the LLM sees — validation happens in [[build-expression]]. Recursion is conveyed by prose + a nested
  example rather than `$ref`, which weaker models handle poorly."
  {:type        "object"
   :description (str "A metric-math expression tree. Each node is ONE of:\n"
                     "1. A metric/measure reference: "
                     "`{\"type\": \"metric\", \"id\": 42}` (use \"measure\" for measures). "
                     "Optionally attach a per-reference filter with `\"filter\"` (an MBQL filter clause).\n"
                     "2. An arithmetic node: `{\"op\": \"/\", \"operands\": [<expr>, <expr>, ...]}` where "
                     "`op` is one of \"+\", \"-\", \"*\", \"/\" and each operand is itself an expression "
                     "node (this is how nesting works). Operators follow normal precedence via nesting.\n"
                     "3. A numeric constant, e.g. `100`.\n"
                     "The whole expression must reference at least one metric or measure. Example — "
                     "revenue divided by headcount then scaled: "
                     "`{\"op\": \"*\", \"operands\": [{\"op\": \"/\", \"operands\": "
                     "[{\"type\": \"metric\", \"id\": 42}, {\"type\": \"measure\", \"id\": 7}]}, 100]}`.")
   :properties  {"type"     {:type "string" :enum ["metric" "measure"]}
                 "id"       {:type "integer"}
                 "filter"   {:type "object"}
                 "op"       {:type "string" :enum ["+" "-" "*" "/"]}
                 ;; items intentionally unconstrained: an operand is itself an expression node
                 ;; (metric/measure object, arithmetic object, or a bare number).
                 "operands" {:type "array" :items {}}}})

(def ^:private metric-math-args-schema
  "Args schema for `compute_metric_math`. `:expression` carries the recursive tree (JSON schema
  hand-authored above); `:breakout` optionally groups every metric by a shared dimension, referenced
  by the `field_id` surfaced in metric metadata (the stable key used to match the same logical
  dimension across metrics)."
  [:map {:closed true}
   [:reasoning   {:optional true} [:maybe :string]]
   [:expression  [:map {:json-schema expression-json-schema}]]
   [:breakout    {:optional true}
    [:map {:closed true}
     [:field_id      pos-int?]
     [:temporal_unit {:optional true} [:maybe :string]]]]
   [:display     {:optional true} [:enum "line" "bar" "area" "row" "table" "scalar"]]
   [:title       :string]])

;;; ------------------------------------------------ Build ------------------------------------------------

(defn- agent-error!
  "Throw an LLM-facing validation error the tool wrapper relays verbatim."
  [msg]
  (throw (ex-info msg {:agent-error? true :status-code 400})))

(defn- build-expression
  "Recursively convert the LLM's structured expression into the internal AST, stamping a fresh
  `:lib/uuid` on each leaf occurrence (so the same metric can appear more than once) and collecting
  per-leaf filters. Returns `{:ast <internal-expr> :filters [<instance-filter> ...]}`.
  Throws an `:agent-error?` on malformed input."
  [expr]
  (cond
    (number? expr)
    {:ast expr :filters []}

    (and (map? expr) (contains? expr :op))
    (let [op       (some-> (:op expr) name keyword)
          operands (:operands expr)]
      (when-not (and (contains? math-operators op)
                     (sequential? operands)
                     (>= (count operands) 2))
        (agent-error! (tru "Each arithmetic node needs an \"op\" of +, -, * or / and at least 2 \"operands\".")))
      (let [children (mapv build-expression operands)]
        {:ast     (into [op {}] (map :ast) children)
         :filters (into [] (mapcat :filters) children)}))

    (and (map? expr) (contains? expr :type))
    (let [type-kw (some-> (:type expr) name keyword)
          id      (:id expr)]
      (when-not (and (contains? #{:metric :measure} type-kw) (pos-int? id))
        (agent-error! (tru "Each reference needs a \"type\" of \"metric\" or \"measure\" and a positive integer \"id\".")))
      (let [uuid (str (random-uuid))]
        {:ast     [type-kw {:lib/uuid uuid} id]
         :filters (if-some [f (:filter expr)]
                    [{:lib/uuid uuid :filter f}]
                    [])}))

    :else
    (agent-error! (tru "Invalid expression node: expected a metric/measure reference, an arithmetic node, or a number."))))

(defn- build-definition
  "Build and validate an internal metric definition from tool `args`. Returns
  `{:definition <def> :plan <plan>}`. Throws an `:agent-error?` on invalid LLM input; lets genuine
  permission (403) errors from [[metrics.definition/from-api-definition]] propagate."
  [{:keys [expression breakout]}]
  (let [{:keys [ast filters]} (build-expression expression)]
    (when (empty? (metrics.definition/collect-expression-leaves ast))
      (agent-error! (tru "The expression must reference at least one metric or measure.")))
    ;; Breakout resolution reads each metric's dimensions from the metadata provider, which only sees
    ;; synced dimensions. Unlike the metrics-viewer (which syncs via GET /metric/:id before sending
    ;; projections), this tool resolves the breakout itself, so it must sync first — otherwise a
    ;; never-synced metric exposes zero dimensions and every breakout is wrongly rejected as cross-table.
    (when breakout
      (metrics.definition/sync-expression-dimensions! ast))
    (let [provider (lib-metric/metadata-provider)
          base     (metrics.definition/from-api-definition provider {:expression ast :filters filters})
          def*     (if breakout
                     (lib-metric/project-breakout-by-field-id
                      base
                      (:field_id breakout)
                      (some-> (:temporal_unit breakout) not-empty keyword))
                     base)
          plan     (lib-metric/->query-plan def* {:limit 10000})]
      {:definition def* :plan plan})))

;;; ------------------------------------------------ Tool ------------------------------------------------

(defn- definition->api-shape
  "Strip the (non-serializable) metadata-provider so the definition can be JSON-encoded and posted
  straight back to POST /api/metric/dataset by the frontend."
  [definition]
  (select-keys definition [:expression :filters :projections]))

(mu/defn ^{:tool-name "compute_metric_math"
           :scope     scope/agent-notebook-create}
  compute-metric-math-tool
  "Combine two or more saved metrics/measures with arithmetic (+, -, *, /) into a SINGLE visualization —
  a ratio, rate, percentage, difference, variance, or share of a total — optionally grouped by a shared
  dimension. Prefer this over building a separate chart per metric whenever the answer relates metrics to
  each other. Use the metric/measure ids and dimension field-ids from the metadata tools. Produces a chart
  the user sees; it does not return the computed numbers to you."
  [{:keys [breakout display title] :as args} :- metric-math-args-schema]
  (try
    (let [{:keys [definition plan]} (build-definition args)
          api-def   (definition->api-shape definition)
          display*  (or display "line")
          instruction-text
          (te/lines
           "Your metric-math visualization has been created and shown to the user."
           ""
           "Briefly describe what it shows. You do not have the underlying numbers — do not invent them.")]
      {:output            (str "<result>\n"
                               (tru "Built a {0} visualization titled \"{1}\"." display* title)
                               "\n</result>\n"
                               "<instructions>\n" instruction-text "\n</instructions>")
       :data-parts        [(streaming/metric-viz-part
                            (cond-> {:definition api-def
                                     :display    display*
                                     :title      title}
                              breakout (assoc :breakout breakout)))]
       :structured-output (cond-> {:definition api-def
                                   :display    display*
                                   :title      title
                                   :plan-type  (:plan/type plan)}
                            breakout (assoc :breakout breakout))
       :instructions      instruction-text})
    (catch Exception e
      (let [{:keys [agent-error? status-code]} (ex-data e)]
        (cond
          agent-error?
          (do (log/debug e "compute_metric_math returned agent-error to the LLM")
              {:output (ex-message e)})
          ;; Expected, LLM- or user-actionable conditions: bad input / breakout incompatibility (400),
          ;; missing permission on a referenced metric (403), or a missing entity (404). Relay cleanly.
          (contains? #{400 403 404} status-code)
          (do (log/debug e "compute_metric_math: definition rejected" {:status-code status-code})
              {:output (ex-message e)})
          :else
          (do (log/error e "Failed to compute metric math")
              {:output (str "Failed to compute metric math: " (or (ex-message e) "Unknown error"))}))))))
