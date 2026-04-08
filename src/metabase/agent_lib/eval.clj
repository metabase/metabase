(ns metabase.agent-lib.eval
  "Structured MBQL program interpretation."
  (:require
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.eval.invoke :as eval.invoke]
   [metabase.agent-lib.eval.source :as eval.source]
   [metabase.agent-lib.eval.walker :as eval.walker]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.refs :as refs]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.validate :as validate]
   [metabase.agent-lib.validate.walker :as walker]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- skip-operation?
  "True when an operation is a redundant implicit join that should be elided."
  [runtime query op operation]
  (and (= op 'join)
       ((get (:bindings runtime) 'skip-join?) query operation)))

(defn- apply-operation
  "Evaluate a single operation's args and invoke its helper against `query`."
  [evaluate-node runtime query op-path [raw-op & raw-args]]
  (let [op   (runtime/op-symbol raw-op)
        args (eval.walker/evaluate-args evaluate-node query op-path op raw-args)]
    (eval.invoke/invoke-helper! runtime op-path op (into [query] args))))

(defn- program-has-breakouts?
  "True when the program's operations include at least one explicit breakout."
  [program]
  (some (fn [[op]]
          (= "breakout" (when (string? op) op)))
        (:operations program)))

(defn- strip-default-breakouts
  "Remove default breakouts from a metric source query when the program supplies its own.
  Metrics include a default time dimension breakout in their query definition. When the
  agent explicitly specifies breakout operations, these should replace — not augment — the
  defaults."
  [source-query program]
  (if (and (mbql/query? source-query) (program-has-breakouts? program))
    (lib/remove-all-breakouts source-query)
    source-query))

(defn- evaluate-program*
  [runtime context path program program-depth]
  (when (> program-depth walker/max-program-nesting)
    (invalid-program! path "program source nesting exceeds maximum depth"))
  (let [evaluate-program (fn [nested-path nested-program]
                           (evaluate-program* runtime context nested-path nested-program (inc program-depth)))
        evaluate-node    (fn [current-query node-path value]
                           (eval.walker/evaluate-node evaluate-program
                                                      runtime
                                                      current-query
                                                      node-path
                                                      value))
        resolved-source (eval.source/resolve-source evaluate-program
                                                    runtime
                                                    (conj path :source)
                                                    (:source program))
        source-query    (-> (if (mbql/query? resolved-source)
                              resolved-source
                              (eval.invoke/invoke-helper! runtime (conj path :source) 'query [resolved-source]))
                            (strip-default-breakouts program))
        final-query     (reduce (fn [query [op-idx operation]]
                                  (let [op-path (into path [:operations op-idx])
                                        op      (runtime/op-symbol (first operation))]
                                    (if (skip-operation? runtime query op operation)
                                      query
                                      (apply-operation evaluate-node runtime query op-path operation))))
                                source-query
                                (map-indexed vector (:operations program)))]
    (eval.invoke/ensure-query-result! final-query)))

(defn- card-underlying-table-ids
  "For a sequence of card metadata records, return the distinct underlying table-ids reachable
  from each card's visible columns. Cards/metrics may unfold into one or more tables, so we
  resolve them lazily through `lib/visible-columns`."
  [metadata-provider cards]
  (into #{}
        (mapcat (fn [card]
                  (try
                    (->> (lib/query metadata-provider card)
                         lib/visible-columns
                         (keep :table-id))
                    (catch Exception _ nil))))
        cards))

(defn- in-scope-table-ids
  "Resolve the set of table-ids whose metadata the runtime needs in order to evaluate `program`.

  Walks the program for explicitly-referenced metadata IDs, then expands them:
   * field-ids → bulk-fetched in one query, contribute their `:table-id`;
   * card/metric-ids → bulk-fetched, expanded via `lib/visible-columns` to underlying tables;
   * measure-ids → bulk-fetched, contribute their `:table-id`;
   * source-entity from the context, when it's a table.

  We deliberately ignore the LLM-supplied `:referenced-entities` and `:surrounding-tables` —
  the operations and source declared by the program are the ground truth for what metadata
  needs to be loaded. If the agent references a table or field it forgot to declare, the
  walker still picks it up."
  [metadata-provider context program]
  (let [{:keys [table-ids field-ids card-ids metric-ids measure-ids]}
        (refs/collect-program-refs program)
        source-table-id (when (= "table" (some-> context :source-entity :model))
                          (some-> context :source-entity :id))
        fields  (when (seq field-ids)
                  (lib.metadata/bulk-metadata metadata-provider :metadata/column field-ids))
        cards   (when (or (seq card-ids) (seq metric-ids))
                  (lib.metadata/bulk-metadata metadata-provider :metadata/card
                                              (into #{} cat [card-ids metric-ids])))
        measures (when (seq measure-ids)
                   (lib.metadata/bulk-metadata metadata-provider :metadata/measure measure-ids))]
    (cond-> (set table-ids)
      source-table-id  (conj source-table-id)
      (seq fields)     (into (keep :table-id) fields)
      (seq cards)      (into (card-underlying-table-ids metadata-provider cards))
      (seq measures)   (into (keep :table-id) measures))))

(mu/defn evaluate-program :- :map
  "Validate and interpret a structured MBQL program."
  [program              :- :map
   metadata-providerable :- :any
   context               :- validate/EvaluationContext]
  (log/debugf "Evaluating structured program with %d operations" (count (:operations program)))
  (let [program (validate/validated-program program context)
        mp      (lib.metadata/->metadata-provider metadata-providerable)
        scope   (in-scope-table-ids mp context program)
        runtime (runtime/build-runtime mp {:in-scope-table-ids scope
                                           :extra-bindings     {'source (:source-metadata context)}})]
    (evaluate-program* runtime context [] program 0)))
