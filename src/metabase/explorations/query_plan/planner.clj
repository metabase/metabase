(ns metabase.explorations.query-plan.planner
  "The query-planner contract.

  Concrete planners (mechanical, future stubs) live in their own
  namespaces and implement `QueryPlanner`. The orchestrator
  (`metabase.explorations.query-plan`) selects one based on settings + LLM
  availability and dispatches through the protocol — it never knows which
  concrete planner it's calling.

  This namespace exists separately to break what would otherwise be a cycle:
  the orchestrator requires every concrete planner, and every concrete
  planner needs the protocol it implements."
  (:require
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn plan-item-schema
  "Returns the Malli schema for a single plan item. Public so concrete
  planners and tests can reuse it. Plan items are emitted by `plan!`
  implementations and consumed by the orchestrator's
  variant-builder dispatch."
  []
  [:map
   [:block_id     pos-int?]
   [:metric_id    pos-int?]
   [:dimension_id :string]
   [:variant      :string]
   [:params       {:optional true} :map]
   [:rationale    {:optional true} [:maybe :string]]])

(mu/defn result-schema
  "Returns the Malli schema for a planner result. `:ok` carries a `:plan` of
  items; `:failed` carries `:final-errors`; `:skip-not-applicable` is a soft
  exit (planner had nothing to emit, orchestrator should treat the thread as
  empty, not failed)."
  []
  [:map
   [:outcome      [:enum :ok :failed :skip-not-applicable]]
   [:plan         {:optional true} [:maybe [:sequential (plan-item-schema)]]]
   [:rationale    {:optional true} [:maybe :string]]
   [:transcript   {:optional true} :any]
   [:final-errors {:optional true} [:maybe [:sequential :string]]]])

(defprotocol QueryPlanner
  "Pluggable query-planner contract for Explorations.

  Implementations are values (records or reified instances). The orchestrator
  selects one and dispatches through the protocol — no concrete planner
  namespace is special-cased."
  (planner-name [this]
    "Keyword identifying the planner — e.g. `:mechanical`. Stamped
    into the persisted transcript and log lines so a thread's transcript can
    be traced back to the implementation that produced it.")

  (plan! [this ctx]
    "Produce a plan for `ctx`. The ctx shape is documented on
    `metabase.explorations.query-plan/generate-query-plan!` and is the same
    for every implementation:

      {:thread-id          long
       :thread-prompt      string|nil
       :metric-dim-ctx     <output of qp.context/metric-and-dim-context — keyed by :blocks>
       :metric-by-key      {[block-id metric-id] metric-context-map}
       :creator-id         long|nil
       :thread-blocks      [ExplorationBlock ...]}

    Returns a map matching `result-schema`. The orchestrator handles
    materialization, transcript persistence, and failure-doc writing — every
    planner just builds plan items and reports its outcome."))
