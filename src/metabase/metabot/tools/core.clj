(ns metabase.metabot.tools.core
  "The API a Metabot tool author writes against.

  A tool is a record implementing [[Tool]]. It says what it is ([[declaration]]) and what it does
  ([[handle]]), and it reports failure by throwing: `defrecoverable` for a failure the agent can work
  around, `unrecoverable!` for one only the user can act on. Nothing here decides where an error goes
  or what text each audience sees — that is `metabase.metabot.tools.runtime`'s job, so a tool says
  what happened exactly once.

  A record rather than a function because several of our tools are the *same* tool under different
  configuration, and a record says so. The four `search` tools share a scope, a title function and a
  body, and differ only in their name, description, argument schema, allowed entity types and an
  options map — four instances of one type, not four functions that happen to resemble each other.

  Handlers return success only. There is no error-shaped success value and no `{:output \"Failed
  to …\"}` convention: a failure is thrown, so forgetting to handle one cannot silently hand the
  model a sentence nobody wrote.

  Everything a tool does about a failure is written at the call site, and the default — doing
  nothing — is that the failure ends the turn:

  - *relay a foreign error*: a converter ([[with-entity]], [[with-pipeline-errors]]) turns one known
    shape into a declared recoverable error. A shape a converter does not recognise passes through
    unchanged and is therefore unrecoverable.
  - *do one thing per item*: implement [[BatchedTool]] as well, and let [[handle]] delegate to
    [[handle-each]]. A declared recoverable error then becomes that item's contribution instead of
    ending the turn.
  - *give up on the user's behalf*: `unrecoverable!`, with a `:user-message`.

  Note what is deliberately absent: the runtime knows only [[Tool]]. It calls [[handle]] and that is
  all. [[BatchedTool]] is a contract between a tool and [[handle-each]], not something the runtime
  branches on, so there is no `satisfies?` test anywhere in the invocation path and a reader can
  follow one tool's behaviour without knowing which other shapes exist."
  (:require
   [clojure.string :as str]
   [metabase.metabot.schema.v2 :as schema.v2]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.recoverable.pipeline :as recoverable.pipeline]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/import-vars
 [tools.error
  defrecoverable
  unrecoverable!])

;;; ------------------------------------------------ Renderable ----------------------------------------------------

(defprotocol Renderable
  "Agent-facing text that the *consumer* turns into a string.

  The reason this exists rather than `:output` simply being a string: MCP builds its prose as
  `metabase.mcp.v2.message/msg` records and renders them at the boundary, deliberately, so that
  locale and untrusted interpolations are decided by whoever is sending the response rather than by
  whoever wrote the sentence. Metabot has no such need and uses plain English strings.

  Making the result carry a renderable instead of a string means neither surface has to give that up,
  and a tool does not have to know which one is consuming it. A string is the trivial case."
  (render-text [this]
    "This value as a string, for a consumer that is about to put it on the wire."))

(extend-protocol Renderable
  String
  (render-text [this] this))

(defn renderable?
  "Whether `x` can be [[render-text]]ed. Deliberately not satisfied by every object: a result whose
  `:output` is a map or a keyword is a bug, and `::result` should reject it."
  [x]
  (satisfies? Renderable x))

(mr/def ::renderable
  "Agent-facing text: a string, or anything extending [[Renderable]]."
  [:fn {:error/message "a string, or a value extending metabase.metabot.tools.core/Renderable"}
   renderable?])

;;; ------------------------------------------------ Schemas -------------------------------------------------------

(def ^:private DataPart
  "One entry of a result's `:data-parts`: `metabase.metabot.agent.streaming`'s `{:type :data, …}`
  constructors."
  [:map {:closed true}
   [:type      [:= :data]]
   [:data-type :string]
   [:data      {:optional true} [:maybe ::schema.v2/tool-io]]])

(mr/def ::declaration
  "What a tool tells the runtime and the providers about itself.

  Closed on purpose: a misspelled key (`:capability`, `:scopes`) would otherwise read as \"this tool
  needs nothing\" and quietly drop a gate.

  `:description` is the model-facing text. It is a field rather than a docstring because a tool that
  exists in several configurations should be able to build it — the four `search` tools each hardcode
  theirs today precisely because a docstring cannot be computed.

  `:name`, `:description`, `:args` and `:scope` are the neutral core: every consumer needs all four,
  and `:scope` is shared because both surfaces check strings from the same `api-scope` registry (MCP
  tools already declare `metabot.scope/agent-content-read`).

  Everything else is namespaced by the consumer it is for, and a consumer reads only its own
  namespace. That is what lets a tool be declared once and consumed by a surface it was not written
  for: MCP would read `:mcp/annotations`, `:mcp/required-extensions`, `:mcp/output-schema`,
  `:mcp/title` and `:mcp/_meta`, see no `:metabot/*` keys it cares about, and fall back to its own
  defaults.

  So this map cannot be closed — a closed map would make adding a consumer a change to this schema.
  The typo protection a closed map gave us is kept by a different rule, enforced in
  [[validate-tool!]]: every key outside the core must be namespaced. `:capability` is rejected,
  `:metabot/capabilities` is not, and a misspelling *within* a namespace is that consumer's to catch
  since it is the only thing that knows its own keys."
  [:map
   [:name         :string]
   [:description  :string]
   ;; `:any` rather than a schema-of-schemas: this is a Malli schema in any of its forms — a
   ;; registry keyword, a vector form, or a compiled Schema. `validate-tool!` checks it compiles.
   [:args         :any]
   [:scope                  {:optional true} [:maybe :string]]
   [:metabot/capabilities   {:optional true} [:maybe [:set :keyword]]]
   [:metabot/title-fn       {:optional true} [:maybe fn?]]])

(mr/def ::result
  "What [[handle]] returns. Success only — a failure is thrown.

  `:output` is required and is the whole of what the model reads, so instructions belong in it rather
  than in a separate key. `:structured-output` is not a success signal and is not a second copy of
  the output: include it only when a named consumer reads it (the agent loop's query and chart memory
  and its markdown link buffer, `metabase.metabot.used-tables`, the document API's chart draft,
  `metabase.metabot.agent.user-context`, and EE analytics persistence)."
  [:map {:closed true}
   [:output            ::renderable]
   [:structured-output {:optional true} ::schema.v2/tool-io]
   [:data-parts        {:optional true} [:sequential DataPart]]])

(mr/def ::entry
  "One item's contribution, as [[compose]] sees it.

  Uniform whether the item loaded or failed: `:output` is always a string — the item's own text, or
  its failure rendered — and `:failed?` is always a boolean. A composer that concatenates therefore
  never asks which happened, and one that separates them asks a boolean rather than probing for a
  key."
  [:map {:closed true}
   [:item              :any]
   [:output            :string]
   [:failed?           :boolean]
   [:error             {:optional true} ::tools.error/recoverable]
   [:structured-output {:optional true} ::schema.v2/tool-io]
   [:data-parts        {:optional true} [:sequential DataPart]]])

;;; ------------------------------------------------ Protocols -----------------------------------------------------

(defprotocol Tool
  "Every Metabot tool. One call, one unit of work."
  (declaration [this]
    "This tool's complete [[::declaration]] — what the model is told it is, and what a consumer
    gates it on.

    Written out as a literal map rather than derived from the record's fields, because it is the
    tool's contract with the model and a reader should be able to see all of it in one place.")
  (handle [this args ctx]
    "Do the work for one call. `args` have already been coerced and validated against the
    declaration's `:args`, so destructure them without re-checking.

    Returns a [[::result]] or throws."))

(defprotocol BatchedTool
  "A tool that can also be called for several items at once.

  The rule: for everything that differs between the single and the batched form, this protocol has a
  `batched-…` function that receives the single form and returns a **complete** batched form. Nothing
  is derived by the framework, so there are no special cases and no shape a tool cannot express.

  [[Tool]] stays the single-item tool. Take `BatchedTool` away and the record is still a working
  tool that reads one URI, loads one id, edits one query. That is the point: `handle` *is* the item
  loader, so there is no second per-item function to keep in step with it, and the single form can be
  tested and published on its own.

  The consumer orchestrates. It asks whether a tool satisfies this protocol, and if so calls
  [[run-batched]] instead of [[handle]]. That is one branch in each consumer, in exchange for the
  single form being independently real."
  (batched-declaration [this declaration]
    "The complete [[::declaration]] for the batched form, given the single one.

    Two things usually differ: `:args` becomes a map holding a sequence, and `:description` gains a
    sentence about the per-call limit. Everything else — name, scope, namespaced extras — is normally
    passed through.

    The tool composes `:args` itself rather than the framework wrapping the single schema. That is
    what lets `read_resource` publish `[:sequential :string]` while its single form takes
    `{:uri :string}`, and lets a tool with heterogeneous items embed the single schema whole. Share
    the item schema through a var so the two cannot drift.")
  (batched-args [this args]
    "The batched `args`, split into one single-form args map per item, in the order the agent asked.

    The inverse of what [[batched-declaration]] did to `:args`. The tool owns both, so the framework
    never has to guess how the plural shape maps onto the singular one.")
  (around-batch [this item-args ctx run]
    "Run the whole batched call, wrapped in whatever it needs. `(run)` performs it and returns the
    composed result.

    This is where batching in the database sense belongs. `metabase.metabot.metadata-perms/with-cache`
    is a wrapper, so `(with-cache (run))` is the whole implementation; an eager prefetch reads
    `item-args` first and then calls `(run)`. A failure here fails the whole call, which is the right
    answer: five \"not found\"s thrown by a dead connection teach the agent the wrong thing.

    The default is `(run)`. Clojure gives a protocol no way to supply one, so write it out.")
  (compose [this entries ctx]
    "The [[::result]] for the whole call, from one [[::entry]] per item in item order.

    The only thing that decides where a failure appears. [[concatenated]] leaves failures in position
    and is what most tools want: `(compose [_ entries _] (concatenated entries))`. A tool whose
    output is one document over the whole set has no positions to put them in and will separate them
    out by `:failed?`."))

;;; ------------------------------------------------ Composition ---------------------------------------------------

(defn concatenated
  "The ordinary composition: the entries' `:output`s joined in order, their `:structured-output`s
  collected into a vector, their `:data-parts` concatenated.

  Failures land in position, because a failed entry's `:output` is its rendered failure text and this
  joins what it is given."
  [entries]
  (cond-> {:output (str/join "\n" (map :output entries))}
    (some :structured-output entries) (assoc :structured-output (mapv :structured-output entries))
    (some :data-parts entries)        (assoc :data-parts (vec (mapcat :data-parts entries)))))

(defn- entry
  "One item's [[::entry]]: the result of calling `tool`'s [[handle]] with `item-args`, or its declared
  failure rendered.

  The per-item step, and the only one. A consumer that wants something else does it to the entries
  afterwards through [[with-batched-entries]], which is strictly more than replacing this was: the
  one thing it cannot change is that an undeclared exception from `handle` fails the whole call, and
  that uniformity is the point rather than a limitation."
  [tool item-args ctx]
  (try
    (let [result (handle tool item-args ctx)]
      (when-not (mr/validate ::result result)
        (throw (ex-info (str "handle returned an invalid result for " (pr-str item-args))
                        {:item-args item-args :result result})))
      (assoc result :item item-args :failed? false :output (render-text (:output result))))
    (catch Throwable e
      (let [error (tools.error/classify e)]
        (if (= :recoverable (:class error))
          {:item    item-args
           :error   error
           :output  (tools.error/recoverable-text error (:tool-names ctx))
           :failed? true}
          (throw e))))))

(defrecoverable all-items-failed!
  "Every item in a batched call failed, so the call has nothing to report but its failures."
  {:payload [:map {:closed true}
             [:count  :int]
             ;; What `compose` produced, rendered. Carried rather than rebuilt so the model reads
             ;; exactly what a call that lost all but one item would have shown it.
             [:output :string]]}
  [{:keys [output]}]
  ;; The composed text is the whole message. Each item's own recovery steps are already inside it —
  ;; `entry` rendered them through `recoverable-text` for this profile — so there is nothing to add
  ;; here, and a step of our own would be advice about a call rather than about any of its items.
  {:message  output
   :recovery []})

(defn with-batched-entries
  "`f` applied to the entries of `tool`'s batched call — one [[::entry]] per item, in item order.
  Returns whatever `f` returns. `around-batch` wraps both the item loading and `f`, so a tool that
  prewarms a cache still holds it while `f` runs.

  THE ONLY CALLER IS `metabase.agent-api.api`'s `POST /v1/read-resource`, and this function exists
  for it alone. That endpoint publishes a different contract from the agent loop's: one HTTP status
  for the whole call and an `:error` on each item that could not be read, so a single-URI request
  that missed is still a 200 carrying one failed item. [[run-batched]] cannot serve that — it answers
  with one [[::result]] and throws when nothing was delivered — and before this existed the endpoint
  got its per-item data by having `read_resource`'s own `compose` build it, which left a tool
  constructing one of its consumers' response shapes.

  So if that endpoint goes away, delete this with it. Nothing else should reach for it: a consumer
  that wants one result per call wants [[run-batched]], which is this with `compose` and the
  nothing-was-delivered check on top."
  [tool args ctx f]
  (let [item-args (batched-args tool args)]
    (around-batch tool item-args ctx
                  (fn [] (f (mapv (fn [one] (entry tool one ctx)) item-args))))))

(defn run-batched
  "Perform `tool`'s batched call and return one [[::result]].

  What a consumer calls in place of [[handle]] when a tool satisfies [[BatchedTool]].

  A declared recoverable error from one item becomes that item's contribution — unless every item
  failed, which is a failed call and throws [[all-items-failed!]]. A call that produced nothing must
  not report success: the agent loop decides whether a call worked by the absence of an `:error`, so
  five failures dressed as a result are counted as a success by the provider adapters, by
  `successful-tool-output?` and by telemetry alike. The model reads the same per-item text either
  way, so this changes who is told the call failed, not what it is told. A consumer whose contract
  says otherwise composes the entries itself through [[with-batched-entries]].

  Anything other than a declared recoverable error is rethrown, so an undeclared exception fails the
  whole call and discards the items that did load. That is deliberate: a bug is not a partial
  result."
  [tool args ctx]
  (with-batched-entries tool args ctx
    (fn [entries]
      (let [result (compose tool entries ctx)]
        (if (and (seq entries) (every? :failed? entries))
          ;; The composed output, rendered, rather than a sentence of our own: the model reads
          ;; exactly what a call that lost all but one item would have shown it.
          (all-items-failed! {:count  (count entries)
                              :output (render-text (:output result))})
          result)))))

(defn batched?
  "Whether `tool` can be called for several items at once.

  Read by [[call]], to decide which of the two protocols to go through, and by [[validate-tool!]],
  to decide whether there is a second declaration to check."
  [tool]
  (satisfies? BatchedTool tool))

(defn call
  "Call `tool` with `args` and `ctx`, and return one [[::result]].

  The entry point a consumer uses. One item or several, depending on the tool, so a consumer does not
  branch and does not need to know which kind it has. [[handle]] is the protocol method for one
  item's work; this is the function that performs a call.

  A consumer whose contract differs from `run-batched`'s — one that answers per item rather than per
  call — uses [[with-batched-entries]] instead of this."
  [tool args ctx]
  (if (batched? tool)
    (run-batched tool args ctx)
    (handle tool args ctx)))

;;; ------------------------------------------------ Registration --------------------------------------------------

(def ^:private tool-name-pattern
  "Model-facing tool names are snake_case. Providers differ on what they accept, and a name one
  rejects fails the whole turn, so the declaration is the place to find out."
  #"^[a-z][a-z0-9_]*$")

(def ^:private core-declaration-keys
  "The keys every consumer needs. Anything else must be namespaced for one; see [[::declaration]]."
  #{:name :description :args :scope})

(defn- validate-declaration!
  "Check one declaration, throwing on anything a load-time check can catch."
  [declared]
  (let [{tool-name :name :keys [args]} declared]
    (when-not (mr/validate ::declaration declared)
      (throw (ex-info (str "Invalid tool declaration: " (pr-str declared))
                      {:declaration declared
                       :explain     (mr/explain ::declaration declared)})))
    ;; The declaration is open so a new consumer can add its own keys without editing the schema,
    ;; which costs us the typo protection a closed map gives. This buys it back: an unqualified key
    ;; outside the core is a misspelling of a core key or a consumer key someone forgot to namespace,
    ;; and either way it would be read by nobody and silently drop whatever it was meant to do.
    (when-let [stray (seq (remove #(or (contains? core-declaration-keys %) (qualified-keyword? %))
                                  (keys declared)))]
      (throw (ex-info (str "Tool " tool-name " declares unnamespaced key(s) " (vec stray)
                           ". Only " (vec (sort core-declaration-keys)) " are consumer-neutral;"
                           " anything else belongs to one consumer and must say which, e.g."
                           " :metabot/capabilities.")
                      {:name tool-name :stray (vec stray)})))
    (when-not (re-matches tool-name-pattern tool-name)
      (throw (ex-info (str "Tool name " (pr-str tool-name) " is not snake_case") {:name tool-name})))
    ;; Build the validator now rather than on the first model call. `mr/schema` on an unregistered
    ;; keyword comes back without complaint, so an `:args` schema with a typo'd registry reference
    ;; would pass a weaker check and then turn every call of this tool into an argument-validation
    ;; failure in production, with nothing to say the declaration was at fault. Building the
    ;; validator is what the runtime does, and it is cached, so this checks the real thing.
    (try
      (mr/validator args)
      (catch Throwable e
        (throw (ex-info (str "Tool " tool-name " has an :args schema that does not compile")
                        {:name tool-name} e))))
    declared))

(defn validate-tool!
  "Check `tool`'s declaration — and its batched declaration, when it has one — and return the
  declaration a consumer publishes.

  Both are checked because both are published schemas somewhere: the single one by a consumer that
  calls `handle` directly, the batched one by every consumer of a [[BatchedTool]]. A batched `:args`
  the tool composed wrongly would otherwise fail on the first model call."
  [tool]
  (let [declared (validate-declaration! (declaration tool))]
    (if (batched? tool)
      (validate-declaration! (batched-declaration tool declared))
      declared)))

(defn entries
  "The runtime's `entries` map — tool name to `{:declaration … :tool …}` — for one profile's `tools`.

  The declaration is the published one, so a batched tool's entry carries its batched `:args` and the
  runtime validates the model's arguments against the shape it was actually offered.

  Rejects two tools claiming the same name: within a profile the name is how the model and the
  runtime address a tool, so a collision means one of them is unreachable and which one depends on
  the order of the seq. Across profiles a name legitimately belongs to several tools — `search` has
  four — which is why there is no global registry."
  [tools]
  (reduce (fn [acc tool]
            (let [{tool-name :name :as declared} (validate-tool! tool)]
              (when (contains? acc tool-name)
                (throw (ex-info (str "Two tools claim the tool name " tool-name)
                                {:name tool-name})))
              (assoc acc tool-name {:declaration declared :tool tool})))
          {}
          tools))

;;; ------------------------------------------------ Converters ----------------------------------------------------

(def ^:private refusal-status-codes
  "The statuses that mean \"you may not see this\" or \"this is not here\". `api/read-check` raises a
  403 for the first and a 404 for the second, and the converters collapse them."
  #{403 404})

(defn do-with-entity
  "Implementation of [[with-entity]]."
  [{:keys [kind id]} thunk]
  (try
    (thunk)
    (catch Throwable e
      (if (contains? refusal-status-codes (:status-code (ex-data e)))
        (tools.error/throw-recoverable! ::recoverable.common/not-found
                                        (cond-> {} kind (assoc :kind kind) (some? id) (assoc :id id))
                                        {:cause e})
        (throw e)))))

(defmacro with-entity
  "Convert a read refusal from `body` into the declared `not-found!` error for `entity`.

    (with-entity {:kind :timeline :id timeline-id}
      (timeline/include-events-singular (timeline/get-timeline timeline-id)))

  `entity` is `{:kind <keyword> :id <id>}`. A 403 and a 404 — the two things `api/read-check` raises
  — both become the same recoverable error; see `recoverable.common/not-found!` for why they are not
  distinguished. Every other exception passes through, so a genuine failure inside `body` stays
  unrecoverable instead of being reported to the model as a missing entity."
  {:style/indent [:defn]}
  [entity & body]
  `(do-with-entity ~entity (fn [] ~@body)))

(def ^:private pipeline-ns
  "The namespace holding the pipeline declarations.

  Read off one of the declarations rather than written as a string, because the conversion finds them
  through the catalog by code: renaming the namespace would otherwise leave this mapping pointing at
  codes nothing declares, and every pipeline error would quietly become unrecoverable with no failing
  test to say so."
  (str (ns-name (:ns (meta #'recoverable.pipeline/unknown-table!)))))

(defn- pipeline-error-code
  "The `recoverable.pipeline` code for a pipeline `:error` keyword, or nil when none is declared."
  [error]
  (when (keyword? error)
    (let [code (keyword pipeline-ns (name error))]
      (when (contains? (tools.error/recoverables) code)
        code))))

(defn do-with-pipeline-errors
  "Implementation of [[with-pipeline-errors]]."
  [thunk]
  (try
    (thunk)
    (catch Throwable e
      (let [{:keys [agent-error? status-code error entity-type entity-id]} (ex-data e)
            code (pipeline-error-code error)]
        (cond
          ;; `:agent-error?` *and* an `:error` key. The pipeline's `as-agent-input-error` stamps
          ;; `:agent-error?` onto foreign exceptions from lib, toucan2 and JDBC as well, and those
          ;; messages are not authored for anyone — only an `:error` code says "this sentence was
          ;; written for a model".
          (and agent-error? code)
          (tools.error/throw-recoverable!
           code
           (cond-> {:message (or (ex-message e) "")}
             entity-type       (assoc :entity-type entity-type)
             (some? entity-id) (assoc :entity-id entity-id))
           {:cause e})

          (contains? refusal-status-codes status-code)
          (tools.error/throw-recoverable! ::recoverable.common/not-found {} {:cause e})

          :else
          (throw e))))))

(defmacro with-pipeline-errors
  "Convert the representations pipeline's agent errors from `body` into declared recoverable errors.

    (with-pipeline-errors
      (construct/execute-representations-query query))

  Three cases:
  - an `:agent-error?` exception whose ex-data carries an `:error` code declared in
    `metabase.metabot.tools.recoverable.pipeline` becomes that error, with the pipeline's own
    sentence as the message;
  - a 403 or 404 becomes `recoverable.common/not-found!`;
  - anything else passes through and is therefore unrecoverable, including an `:error` code with no
    declaration. `metabase.metabot.tools.recoverable.pipeline-test` scans the pipeline sources and
    fails when a code has none, so a new pipeline error cannot quietly start ending turns."
  {:style/indent [:defn]}
  [& body]
  `(do-with-pipeline-errors (fn [] ~@body)))
