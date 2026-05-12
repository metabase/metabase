(ns metabase-enterprise.transform-optimizer.core
  "Public entry point for the transform optimizer.

  The pipeline:

      transform-id ─► context.clj  ─┐
                                    ├─► prompt.clj ─► LLM (Phase 2) ─► proposals
                  prelude.clj  ─────┘                                        │
                                                                             ▼
                                                                  ddl/parse  + scoring
                                                                             │
                                                                             ▼
                                                              {optimization_degree
                                                               summary
                                                               proposals[]}

  Today this namespace stitches the deterministic halves of the pipeline
  together — context, prompt, scoring, DDL validation. The LLM call itself
  is a placeholder (`call-llm-stub`) we replace in Phase 2 with the actual
  Metabot deftool wiring."
  (:require
   [metabase-enterprise.transform-optimizer.context :as context]
   [metabase-enterprise.transform-optimizer.ddl.parse :as ddl.parse]
   [metabase-enterprise.transform-optimizer.llm :as llm]
   [metabase-enterprise.transform-optimizer.prelude :as prelude]
   [metabase-enterprise.transform-optimizer.prompt :as prompt]
   [metabase-enterprise.transform-optimizer.scoring :as scoring]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Building blocks
;;
;; Each of these is independently exercisable from the REPL. `optimize!`
;; below composes them; tests/UI/agent paths can re-use whichever pieces
;; they need.

(defn fetch-transform
  "Hydrate a transform by id, with the keys the optimizer needs."
  [transform-id]
  (or (t2/select-one :model/Transform :id transform-id)
      (throw (ex-info "transform not found"
                      {:transform-id transform-id
                       :status-code 404}))))

(defn build-prompt
  "Assemble the full LLM input for a transform: prelude (system side) + the
  context-rendered markdown (user side). Returns a map suitable for the
  LLM client layer:

      {:system  <prelude>
       :user    <context block>
       :context <raw context map for downstream introspection/tests>}"
  [transform & {:as opts}]
  (let [ctx       (apply context/build-context transform (mapcat identity (or opts {})))
        rendered  (prompt/render-context ctx)]
    {:system  (prelude/prelude)
     :user    rendered
     :context ctx}))

;; ---------------------------------------------------------------------------
;; Proposal post-processing

(defn- pair-set
  "Set of `[schema table]` pairs the LLM is allowed to target with DDL,
  pulled from the context's sources and (when present) target table."
  [ctx]
  (into #{}
        (keep (fn [{:keys [schema table_name]}]
                (when (and schema table_name) [schema table_name])))
        (concat (:sources ctx)
                (when-let [t (:target ctx)] [t]))))

(defn- validate-proposal-ddl
  "Walk `:ddl_statements` on a proposal, swap each entry's `:status` based on
  the validator outcome. Statements that fail validation are kept in the
  payload but marked `:rejected` with a reason so the UI can render the
  failure inline rather than silently dropping them."
  [proposal allowed-tables]
  (update proposal :ddl_statements
          (fn [stmts]
            (mapv (fn [{:keys [statement] :as ddl}]
                    (let [{:keys [ok?] :as r} (ddl.parse/parse statement allowed-tables)]
                      (cond-> ddl
                        ok?         (assoc :validation :accepted
                                           :index_name (:name r))
                        (not ok?)   (assoc :validation :rejected
                                           :rejection  (select-keys r [:reason :detail])))))
                  (or stmts [])))))

(defn finalise-proposals
  "Server-side cleanup applied to a raw proposal set from the LLM:

   1. Validate every DDL statement against the CREATE-INDEX allowlist
      and tag with :validation = :accepted | :rejected.
   2. Compute the deterministic optimization_degree.

   Returns the response payload exactly as the UI consumes it."
  [proposals ctx]
  (let [allowed (pair-set ctx)
        cleaned (mapv #(validate-proposal-ddl % allowed) proposals)]
    {:optimization_degree (scoring/optimization-degree cleaned)
     :proposals           cleaned}))

;; ---------------------------------------------------------------------------
;; Public entry

(defn optimize!
  "End-to-end: load the transform, build the prompt, call Claude with our
  structured-output schema, validate any emitted DDL, score, and return the
  UI-shaped payload.

  This is the synchronous form — useful from the REPL and from the HTTP
  endpoint as a fallback path. The streaming endpoint emits the same payload
  as a sequence of SSE events.

  Options:
    :analyze?     — forwarded to EXPLAIN. Defaults false. Don't pass true for
                    transforms whose latest run took more than a few seconds.
    :llm-opts     — forwarded to `llm/propose-optimizations` (`:model`,
                    `:temperature`, `:max-tokens`).

  Returns:
    {:transform           {…}
     :sql                 <compiled source SQL>
     :summary             <LLM diagnosis>
     :proposals           [{… :ddl_statements [{… :validation …}]} …]
     :optimization_degree <0..100>}"
  [transform-id & {:keys [llm-opts] :as opts}]
  (try
    (let [transform   (fetch-transform transform-id)
          ctx-opts    (dissoc opts :llm-opts)
          prompt-map  (apply build-prompt transform (mapcat identity ctx-opts))
          llm-out     (apply llm/propose-optimizations prompt-map
                             (mapcat identity (or llm-opts {})))
          finalised   (finalise-proposals (:proposals llm-out) (:context prompt-map))]
      (merge {:transform (select-keys transform [:id :name :source_database_id])
              :sql       (-> prompt-map :context :sql)
              :summary   (:summary llm-out)}
             finalised))
    (catch Exception e
      (log/errorf e "transform-optimizer: optimize! failed for transform-id=%s" transform-id)
      (throw e))))
