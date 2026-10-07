(ns metabase.metabot.tools.core
  "The API a Metabot tool author writes against.

  A tool is declared with [[deftool]] and reports failure by throwing: [[defrecoverable]] for a
  failure the agent can work around, [[unrecoverable!]] for one only the user can act on. Nothing
  here decides where an error goes or what text each audience sees — that is
  `metabase.metabot.tools.runtime`'s job, so a tool says what happened exactly once and the runtime
  stays the only place that knows about profiles, rendering and the wire.

  Handlers return success only. There is no error-shaped success value and no `{:output \"Failed
  to …\"}` convention: a failure is thrown, so forgetting to handle one cannot silently hand the
  model a sentence nobody wrote.

  Everything a tool does about a failure is an explicit decision written at the call site, and the
  default — doing nothing — is that the failure bubbles out and ends the turn. There are three such
  decisions, each needing its own form:

  - *relay a foreign error*: a converter ([[with-entity]], [[with-pipeline-errors]]) turns one known
    shape into a declared recoverable error. They are deliberately narrow: a shape a converter does
    not recognise passes through unchanged and ends up unrecoverable.
  - *survive a sub-failure*: [[attempt]] captures a declared recoverable error as data, so a tool
    that does several things can report the ones that failed beside the ones that worked. It catches
    *only* declared recoverable errors — anything else still bubbles.
  - *give up on the user's behalf*: `unrecoverable!`, with a `:user-message`.

  None of them is applied automatically, and there is no blanket \"keep going\" mode. A tool that has
  not thought about a partial failure gets the safe behaviour rather than a silent half-answer."
  (:require
   [clojure.string :as str]
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

;;; ------------------------------------------------ deftool -------------------------------------------------------

(def tool-key
  "The var-metadata key a tool definition lives under.

  The runtime accepts an entry only when this key is present, so a function that merely looks like a
  tool handler cannot be dispatched to by name."
  ::tool)

(mr/def ::tool
  "A tool declaration, as [[deftool]] records it in the handler var's metadata.

  Closed on purpose: a misspelled option (`:capability`, `:scopes`) would otherwise read as \"this
  tool needs nothing\" and quietly drop a gate."
  [:map {:closed true}
   [:name         :string]
   ;; `:any` rather than a schema-of-schemas: this is a Malli schema in any of its forms — a
   ;; registry keyword, a vector form, or a compiled Schema. `deftool` checks separately that it
   ;; compiles.
   [:args         :any]
   [:scope        {:optional true} [:maybe :string]]
   [:capabilities {:optional true} [:maybe [:set :keyword]]]
   [:title-fn     {:optional true} [:maybe fn?]]])

(def ^:private tool-name-pattern
  "Model-facing tool names are snake_case. Providers differ on what they accept, and a name that one
  rejects fails the whole turn, so the declaration is the place to find out."
  #"^[a-z][a-z0-9_]*$")

(defn validate-tool!
  "Check a tool declaration, throwing on anything a load-time check can catch, and return it.
  [[deftool]] calls this."
  [definition]
  (when-not (mr/validate ::tool definition)
    (throw (ex-info (str "Invalid tool declaration: " (pr-str definition))
                    {:definition definition
                     :explain    (mr/explain ::tool definition)})))
  (let [{tool-name :name :keys [args]} definition]
    (when-not (re-matches tool-name-pattern tool-name)
      (throw (ex-info (str "Tool name " (pr-str tool-name) " is not snake_case") {:name tool-name})))
    ;; Build the validator now rather than on the first model call. `mr/schema` on an unregistered
    ;; keyword comes back without complaint, so an `:args` schema with a typo'd registry reference
    ;; would pass a load-time check and then turn every call of this tool into an
    ;; argument-validation failure in production, with nothing to say the declaration was at fault.
    ;; Building the validator is also exactly what the runtime does, and it is cached, so this
    ;; checks the real thing and costs nothing later.
    (try
      (mr/validator args)
      (catch Throwable e
        (throw (ex-info (str "Tool " tool-name " has an :args schema that does not compile")
                        {:name tool-name} e)))))
  definition)

(defmacro deftool
  "Define a Metabot tool handler and record its declaration.

    (deftool edit-sql-query-tool
      \"Edit an existing SQL query using structured edits.\"
      {:name         \"edit_sql_query\"
       :scope        scope/agent-sql-edit
       :capabilities #{:permission-write-sql-queries}
       :args         edit-sql-schema}
      [args ctx]
      …)

  `opts` is a map of:
  - `:name` - *required* - the model-facing tool name, snake_case.
  - `:args` - *required* - Malli schema for the arguments. The runtime validates against it once,
    before the handler runs, so the handler can destructure without re-checking.
  - `:scope` - *optional* - the API scope a caller must hold. Without one the tool is reachable by
    anyone who has the profile.
  - `:capabilities` - *optional* - capabilities the tool requires.
  - `:title-fn` - *optional* - builds the title shown on the tool-input part.

  The handler takes `[args ctx]` and returns `::runtime/handler-result` — `{:output \"…\"}` plus the
  optional keys a concrete consumer reads. It returns success only: a failure is thrown. A handler
  that does several things and should survive one of them failing says so with [[attempt]] at that
  call site, and renders what it captured into its own `:output`; see the namespace docstring.

  The var is the handler, so profiles keep referring to `#'tools/x-tool` and tests can call it
  directly. Expands to a plain `defn`, not `mu/defn`: the runtime validates the arguments in every
  environment, and a second instrumented check in dev only would make dev and prod disagree about
  which error the model sees.

  There is no registry keyed by tool name, because a name legitimately belongs to more than one var
  — `search` has four, one per profile. Uniqueness is a per-profile property, checked where profiles
  are assembled."
  {:style/indent [:defn]}
  [sym docstring opts argv & body]
  (assert (string? docstring) "deftool requires a docstring")
  (assert (map? opts) "deftool requires an options map")
  (assert (and (vector? argv) (= 2 (count argv)))
          "a deftool handler takes exactly two arguments, [args ctx]")
  `(let [definition# (validate-tool! ~opts)]
     (doto (defn ~sym ~docstring ~argv ~@body)
       (alter-meta! assoc tool-key definition#))))

(defn definition
  "The tool declaration on `handler` (a var defined by [[deftool]]), or nil if it has none."
  [handler]
  (when (var? handler)
    (get (meta handler) tool-key)))

(defn entry
  "The runtime entry for a [[deftool]] var: its declaration plus the `:doc` the model is shown and
  the `:handler` to call.

  Throws when `handler` carries no declaration. The runtime dispatches by name, so a var that
  slipped into a profile without going through `deftool` would otherwise be called with no argument
  validation and no scope check."
  [handler]
  (let [definition (definition handler)]
    (when-not definition
      (throw (ex-info (str "Not a deftool var: " handler) {:handler handler})))
    (assoc definition
           :doc     (:doc (meta handler))
           :handler handler)))

(defn entries
  "The runtime's `entries` map — tool name to [[entry]] — for one profile's `handlers`.

  Rejects two handlers claiming the same name: within a profile the name is how the model and the
  runtime address a tool, so a collision means one of them is unreachable and which one depends on
  the order of the seq."
  [handlers]
  (reduce (fn [acc handler]
            (let [{tool-name :name :as e} (entry handler)]
              (when-let [existing (get acc tool-name)]
                (throw (ex-info (str "Two handlers claim the tool name " tool-name)
                                {:name tool-name
                                 :handlers [(:handler existing) handler]})))
              (assoc acc tool-name e)))
          {}
          handlers))

;;; ------------------------------------------------ Recovery steps ------------------------------------------------

(defn recovery-steps-for-tools
  "The subset of `recovery` whose steps only name tools in `tool-names`.

  Shared with the runtime so that a step's `:uses` has exactly one meaning. A step naming a tool the
  profile lacks is dropped, not rewritten: half a sentence about `read_resource` is worse than
  silence."
  [recovery tool-names]
  (let [available (set tool-names)]
    (filterv #(every? available (:uses %)) recovery)))

(defn names-a-tool?
  "Whether `text` names a tool in backticks, e.g. \"call `read_resource`\". Used by the runtime's
  dev/test assertions, which hold that only recovery steps name tools and only ones they declare."
  [text tool-name]
  (str/includes? (str text) (str "`" tool-name "`")))

;;; ------------------------------------------------ Partial failure -----------------------------------------------

(defn do-attempt
  "Implementation of [[attempt]]."
  [thunk]
  (try
    {:value (thunk)}
    (catch Throwable e
      (let [error (tools.error/classify e)]
        ;; Only a declared recoverable error can be captured. Its text was written for the model and
        ;; is covered by the catalog test; an undeclared exception has no such text, and swallowing
        ;; it here would turn a bug into a half-answer the model reports as fact.
        (if (= :recoverable (:class error))
          {:error error}
          (throw e))))))

(defmacro attempt
  "Run `body` and capture a declared recoverable failure instead of letting it end the turn.

  Returns `{:value <result>}` or `{:error <ToolError>}` — the same \"success is the absence of
  `:error`\" shape as `runtime/outcome`. Anything that is not a declared recoverable error is
  rethrown, so a real bug still bubbles out.

  This is how a tool that does several things reports the parts that failed beside the parts that
  worked. It is per call site on purpose: a tool only survives a sub-failure if its author decided it
  should, and the error it survives has to be one somebody wrote text for.

    (let [{:keys [ok failed]} (->> (for [uri uris]
                                     (assoc (attempt (read-one uri)) :uri uri))
                                   (group-by #(if (:error %) :failed :ok)))]
      {:output (str (render-resources (map :value ok))
                    (when (seq failed)
                      (str \"\\n\\nThese could not be read:\\n\"
                           (str/join \"\\n\"
                                     (for [{:keys [uri error]} failed]
                                       (str uri \": \" (recoverable-text error (:tool-names ctx))))))))})

  Note what the handler still owes the model: a failure captured this way is *its* text to place.
  The runtime never sees it, so a captured error that is never rendered is a failure the model is
  never told about."
  {:style/indent 0}
  [& body]
  `(do-attempt (fn [] ~@body)))

(defn recoverable-text
  "A declared recoverable `error` as the lines the model reads: the message, then each recovery step
  the current profile can act on.

  The same assembly the runtime uses for a failed call, exposed so that a tool rendering an
  [[attempt]]ed failure into its own `:output` produces identical text — the agent should not be able
  to tell whether a `not-found!` ended the call or was one of five things the call tried.

  Not re-checked against `runtime/render`'s authored-text assertions: the text comes from a
  declaration, and `metabase.metabot.tools.error-test` already renders every declaration in the
  catalog through those assertions."
  [{:keys [message recovery]} tool-names]
  (->> (recovery-steps-for-tools recovery tool-names)
       (map :text)
       (cons message)
       (str/join "\n")))

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

  Read off one of the declarations rather than written as a string, because the conversion finds
  them through the catalog by code: renaming the namespace would otherwise leave this mapping
  pointing at codes nothing declares, and every pipeline error would quietly become unrecoverable
  with no failing test to say so."
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
