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
   [clojure.string :as str]
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

(defn- coerce-ddl-shape
  "Older prelude drafts (and some LLM training data) emit
  `ddl_statements: [{…}]` instead of `ddl_statement: {…}`. Take the first
  entry from the plural form when the singular field is missing so we
  don't lose the index proposal entirely. Also drop the plural field
  afterwards so downstream code sees exactly one shape."
  [proposal]
  (let [{:keys [ddl_statement ddl_statements]} proposal
        coerced (or ddl_statement (first ddl_statements))]
    (-> proposal
        (dissoc :ddl_statements)
        (cond-> coerced (assoc :ddl_statement coerced)))))

(defn- validate-proposal-ddl
  "Each proposal carries at most one `:ddl_statement` (singular). Validate
  the statement against the CREATE-INDEX allowlist and tag with
  `:validation = :accepted | :rejected`. Rejected statements stay on the
  proposal with their rejection reason so the UI can render the failure
  inline instead of silently dropping the proposal."
  [proposal allowed-tables]
  (let [{:keys [ddl_statement] :as proposal} (coerce-ddl-shape proposal)]
    (if-not ddl_statement
      proposal
      (let [{:keys [ok?] :as r} (ddl.parse/parse (:statement ddl_statement) allowed-tables)]
        (assoc proposal
               :ddl_statement
               (cond-> ddl_statement
                 ok?         (assoc :validation :accepted
                                    :index_name (:name r))
                 (not ok?)   (assoc :validation :rejected
                                    :rejection  (select-keys r [:reason :detail]))))))))

(defn- normalize-sql
  "Textual normalisation for no-op detection: strip SQL comments (line +
  block), strip trailing semicolons, lower-case, collapse all whitespace
  runs to a single space, trim. Two SQL strings that normalise to the
  same value differ only in formatting / punctuation / casing — i.e.
  there's no real rewrite to ship."
  [sql]
  (some-> sql
          (str/replace #"(?s)/\*.*?\*/" "")  ; block comments
          (str/replace #"--[^\n]*" "")       ; line comments
          (str/replace #";+\s*$" "")         ; trailing semicolon(s)
          str/lower-case
          (str/replace #"\s+" " ")
          str/trim))

(defn- noop-rewrite?
  "True when the proposal carries a `body` that, after normalisation, is
  textually identical to the original transform's SQL. This is the
  semicolon / whitespace / comment-only \"rewrite\" anti-pattern — the
  LLM sometimes emits these as wrapper proposals despite the prelude."
  [original-norm proposal]
  (when-let [body-norm (normalize-sql (:body proposal))]
    (= body-norm original-norm)))

(defn finalise-proposals
  "Server-side cleanup applied to a raw proposal set from the LLM:

   1. Drop proposals whose body is textually equivalent to the original
      (cosmetic-only rewrites — strip comments / semicolons / whitespace
      and compare).
   2. Validate the single DDL statement on each `:index` proposal against
      the CREATE-INDEX allowlist and tag with
      `:validation = :accepted | :rejected`.
   3. Compute the deterministic optimization_degree from what's left.

   Returns the response payload exactly as the UI consumes it."
  [proposals ctx]
  (let [allowed       (pair-set ctx)
        original-norm (normalize-sql (:sql ctx))
        noop?         (partial noop-rewrite? original-norm)
        dropped       (filterv noop? proposals)
        kept          (remove noop? proposals)
        cleaned       (mapv #(validate-proposal-ddl % allowed) kept)]
    (when (seq dropped)
      (log/infof "transform-optimizer: dropped %d cosmetic-only proposal(s): %s"
                 (count dropped)
                 (pr-str (mapv :id dropped))))
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
          finalised   (finalise-proposals (:proposals llm-out) (:context prompt-map))
          optimized?  (= 100 (:optimization_degree finalised))]
      ;; Persist the "fully optimized" verdict so the UI can render its
      ;; celebratory state without re-running the LLM on every page view.
      ;; We always write — flipping back to false on a regression is what
      ;; lets the UI hide the gif if the optimizer later finds proposals.
      (when (not= optimized? (boolean (:optimized transform)))
        (t2/update! :model/Transform (:id transform) {:optimized optimized?}))
      (merge {:transform (-> (select-keys transform [:id :name :source_database_id])
                             (assoc :optimized optimized?))
              :sql       (-> prompt-map :context :sql)
              :summary   (:summary llm-out)}
             finalised))
    (catch Exception e
      (log/errorf e "transform-optimizer: optimize! failed for transform-id=%s" transform-id)
      (throw e))))
