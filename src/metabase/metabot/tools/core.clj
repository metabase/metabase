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
   [:data-parts        {:optional true} [:sequential DataPart]]
   [:resources         {:optional true} [:sequential ::schema.v2/tool-io]]])

(mr/def ::item-result
  "What [[load-item]] returns: a [[::result]] whose `:output` is optional.

  Optional rather than required because the two composition styles want different things from an
  item. A tool whose output is a concatenation of its items (`read_resource` wraps each in its own
  element) formats per item, so each item carries its own `:output`. A tool whose output is one
  document over the whole set (`list_available_fields` groups by kind) formats in [[compose]], so its
  items carry only `:structured-output`.

  This is the one place the \"an item is just a smaller tool\" equivalence loosens: a tool must
  produce `:output`, an item need not."
  [:map {:closed true}
   [:output            {:optional true} ::renderable]
   [:structured-output {:optional true} ::schema.v2/tool-io]
   [:data-parts        {:optional true} [:sequential DataPart]]
   [:resources         {:optional true} [:sequential ::schema.v2/tool-io]]])

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
   [:data-parts        {:optional true} [:sequential DataPart]]
   [:resources         {:optional true} [:sequential ::schema.v2/tool-io]]])

;;; ------------------------------------------------ Protocols -----------------------------------------------------

(defprotocol Tool
  "Every Metabot tool. The runtime knows this protocol and nothing else."
  (declaration [this]
    "This tool's [[::declaration]] — what the model is told it is, and what the runtime gates it on.

    Written out as a literal map rather than derived from the record's fields, because it is the
    tool's contract with the model and a reader should be able to see all of it in one place.")
  (handle [this args ctx]
    "Do the work. `args` have already been coerced and validated against the declaration's `:args`,
    so destructure them without re-checking.

    Returns a [[::result]] or throws. A tool that works item by item implements [[BatchedTool]] too
    and delegates here: `(handle-each this args ctx)`."))

(defprotocol BatchedTool
  "A tool whose arguments name several things the agent wants, done one at a time.

  Not a protocol the runtime looks for: [[handle-each]] is what calls these, and a tool reaches
  [[handle-each]] from its own [[handle]]. So implementing this changes nothing until the tool says
  so, and the delegating line in `handle` is where a reader finds out.

  Batching in the database sense belongs in `handle`, before the delegation — warm whatever cache
  [[load-item]] reads (`metabase.metabot.metadata-perms/with-cache` is the existing example). A
  prefetch that fails fails the whole call, which is the right answer: five \"not found\"s thrown by a
  dead connection teach the agent the wrong thing. Keeping it out of the per-item path is also what
  lets [[load-item]] throw, since a batch loader would have to report several failures at once and a
  `defrecoverable` constructor can only throw one."
  (items [this args ctx]
    "The things the agent asked for, in the order it asked. These are the units of partial failure —
    whatever this returns is what a failure can be attributed to.")
  (load-item [this item ctx]
    "One item's [[::item-result]], or throw. A *declared recoverable* error becomes this item's
    contribution; anything else ends the turn, discarding the items that did load. That is the point:
    a bug is not a partial result.")
  (compose [this entries ctx]
    "The [[::result]] for the whole call, from one [[::entry]] per item in item order.

    The only thing that decides where a failure appears. [[concatenated]] leaves failures in position
    and is what most tools want: `(compose [_ entries _] (concatenated entries))`. A tool whose
    output is one document over the whole set has no positions to put them in and will separate them
    out by `:failed?`."))

;;; ------------------------------------------------ Composition ---------------------------------------------------

(defn concatenated
  "The ordinary composition: the entries' `:output`s joined in order, their `:structured-output`s
  collected into a vector, their `:data-parts` and `:resources` concatenated.

  Failures land in position, because a failed entry's `:output` is its rendered failure text and this
  joins what it is given. Delegate to it explicitly from [[compose]] — Clojure gives a protocol no
  way to supply a default, and spelling the delegation out is clearer than any of the ways around
  that."
  [entries]
  (cond-> {:output (str/join "\n" (map :output entries))}
    (some :structured-output entries) (assoc :structured-output (mapv :structured-output entries))
    (some :data-parts entries)        (assoc :data-parts (vec (mapcat :data-parts entries)))
    (some :resources entries)         (assoc :resources (vec (mapcat :resources entries)))))

(defn- entry
  "One item's [[::entry]]: its [[load-item]] result, or its declared failure rendered."
  [tool item ctx]
  (try
    (let [result (load-item tool item ctx)]
      (when-not (mr/validate ::item-result result)
        (throw (ex-info (str "load-item returned an invalid result for " (pr-str item))
                        {:item item :result result})))
      ;; Rendered here so that `compose` and every composer downstream work with strings, and only
      ;; the edges of the system deal in renderables.
      (assoc result :item item :failed? false :output (render-text (:output result ""))))
    (catch Throwable e
      (let [error (tools.error/classify e)]
        (if (= :recoverable (:class error))
          {:item    item
           :error   error
           :output  (tools.error/recoverable-text error (:tool-names ctx))
           :failed? true}
          (throw e))))))

(defn handle-each
  "Run `tool`'s [[load-item]] over its [[items]] and [[compose]] the results.

  What a [[BatchedTool]]'s [[handle]] delegates to. Kept as an ordinary function rather than wired
  into the runtime so that a tool's `handle` still shows its whole shape: the prefetch, then this."
  [tool args ctx]
  (compose tool (mapv #(entry tool % ctx) (items tool args ctx)) ctx))

;;; ------------------------------------------------ Registration --------------------------------------------------

(def ^:private tool-name-pattern
  "Model-facing tool names are snake_case. Providers differ on what they accept, and a name one
  rejects fails the whole turn, so the declaration is the place to find out."
  #"^[a-z][a-z0-9_]*$")

(def ^:private core-declaration-keys
  "The keys every consumer needs. Anything else must be namespaced for one; see [[::declaration]]."
  #{:name :description :args :scope})

(defn validate-tool!
  "Check `tool`'s declaration, throwing on anything a load-time check can catch, and return the
  declaration."
  [tool]
  (let [{tool-name :name :keys [args] :as declared} (declaration tool)]
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

(defn entries
  "The runtime's `entries` map — tool name to `{:declaration … :tool …}` — for one profile's `tools`.

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
