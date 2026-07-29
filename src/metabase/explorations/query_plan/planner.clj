(ns metabase.explorations.query-plan.planner
  "The query-planner contract.

  Concrete planners (mechanical, future stubs) live in their own
  namespaces and implement `QueryPlanner`. The orchestrator
  (`metabase.explorations.query-plan`) selects one based on settings + LLM
  availability and dispatches through the protocol — it never knows which
  concrete planner it's calling.

  This namespace exists separately to break what would otherwise be a cycle:
  the orchestrator requires every concrete planner, and every concrete
  planner needs the protocol it implements.")

(set! *warn-on-reflection* true)

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
    "Produce a plan for `ctx`. The ctx shape is the same
    for every implementation:

      {:thread-id          long
       :thread-prompt      string|nil
       :metric-dim-ctx     <output of qp.context/metric-and-dim-context — keyed by :blocks>
       :metric-by-key      {[block-id metric-id] metric-context-map}
       :creator-id         long|nil
       :thread-blocks      [ExplorationBlock ...]}

    Returns a map with an `:outcome` of `:ok` (carrying a `:plan` of items),
    `:failed` (carrying `:final-errors`), or `:skip-not-applicable` (a soft
    exit — the planner had nothing to emit, and the orchestrator treats the
    thread as empty, not failed), plus optional `:rationale` and
    `:transcript`. Each plan item is a map of `:block_id`, `:metric_id`,
    `:dimension_id`, and `:variant`, with optional `:params` and
    `:rationale`.

    The orchestrator handles materialization, transcript persistence, and
    failure-doc writing — every planner just builds plan items and reports
    its outcome."))
