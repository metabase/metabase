(ns metabase.metabot.tools.runtime
  "Runs one tool call and decides where its failure goes.

  [[invoke]] is the single door into a tool: it resolves the name, coerces and validates the
  arguments, checks the scope, calls the handler, checks what came back, and turns any exception
  into an [[::outcome]]. Tool code says *what happened* by throwing a declared error; this namespace
  is the only thing that decides *who hears about it* and in what words.

  The text rule the whole design rests on: the agent and the user only ever receive authored text.
  Authored text is a `defrecoverable` body's `:message` and recovery steps, a `:user-message` passed
  to `unrecoverable!`, or a sentence built here. No foreign exception message, cause, ex-data or
  stack trace reaches either audience; the full exception goes to the logs instead. [[render]]
  asserts the first half of that in dev and test, because the rule is only as good as the thing that
  checks it.

  Codes come in two flavours. Tool code uses qualified keywords, so a code says which namespace
  raised it. The runtime's own codes are a closed, unqualified vocabulary — [[runtime-codes]] — and
  the agent loop adds one more (`:repeated-error`)."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.api-scope.core :as api-scope]
   [metabase.config.core :as config]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def runtime-codes
  "Every error code the runtime itself produces, with the class each one takes.

  Written down as data so the agent loop, the adapters and the tests share one list rather than
  three sets of literal keywords. `:repeated-error` is the agent loop's and is not raised here."
  {:unknown-tool       :validation
   :invalid-json       :validation
   :invalid-arguments  :validation
   :scope-denied       :unrecoverable
   :internal           :unrecoverable})

;;; ------------------------------------------------ Schemas -------------------------------------------------------

(mr/def ::ctx
  "What a tool is told about the call it is running in.

  `:tool-names` is the only key the framework itself reads — `tools.core/handle-each` passes it to
  the recovery-step filtering. Everything else here is Metabot's own context, which is why it is
  namespaced in a consumer-neutral world: another consumer supplies its own keys and the same tool
  reads whichever it was written against. MCP would pass `:tool-names` (every registered tool, since
  it has no profiles) plus its session id, token scopes and client info.

  `:tool-names` is the set of tools available *this turn*, which [[render]] uses to drop recovery
  steps the agent could not act on.

  `:memory-atom` is absent outside a conversation-backed run, not withheld from particular tools. A
  tool that reads memory when there is some and copes without is easier to reason about than a
  per-tool allowlist, which in practice only meant the memory accessors returned nil for anyone who
  forgot to add their tool to it."
  [:map {:closed true}
   [:profile-id  :keyword]
   [:metabot-id  [:maybe :string]]
   [:tool-names  [:set :string]]
   [:memory-atom {:optional true} :any]])

(mr/def ::outcome
  "What [[invoke]] returns to `self/` and the agent loop.

  A failure keeps `:output` — the text the model receives and the conversation history stores — next
  to the machine-readable `:error`. Success is the absence of `:error`; nothing has to inspect
  `:structured-output` to tell the two apart."
  [:multi {:dispatch #(if (:error %) :failure :success)}
   [:success ::tools/result]
   [:failure [:map {:closed true}
              [:output :string]
              [:error  [:map {:closed true}
                        [:class        [:enum :validation :recoverable :unrecoverable]]
                        [:code         :keyword]
                        [:user-message {:optional true} :string]]]]]])

;;; ------------------------------------------------ Arguments -----------------------------------------------------

;;; The argument-repair machinery below currently also lives in `metabase.metabot.self.core`. It is
;;; duplicated rather than shared because the dependency runs the other way once tools are migrated
;;; — `self.core/run-tool` will call [[invoke]] — and `self.core`'s copies go away with the checks
;;; they serve. Keep the wording identical until then: this is the text models have been repairing
;;; against.

(def ^:private stringified-scalar-transformer
  "Parses stringified numbers and booleans back into scalars, driven by the tool's own schema.
  Restricted to the types models get wrong — strings, keywords and enums are left alone."
  (mtx/transformer
   {:name     :llm-stringified-scalars
    :decoders (select-keys (mtx/-string-decoders)
                           [:int :double :float :boolean 'int? 'double? 'float? 'boolean?
                            'integer? 'nat-int? 'neg-int? 'pos-int? 'number? 'decimal?])}))

(defn- coerce-stringified-scalars
  "Coerce string `arguments` to the scalar types `args-schema` declares. Some models send numbers as
  JSON strings, e.g. `{\"limit\": \"15\"}`. Values that can't be parsed are left alone."
  [args-schema arguments]
  (or (try
        (mc/decode args-schema arguments stringified-scalar-transformer)
        (catch Throwable _ nil))
      arguments))

(defn- json-type-name
  [v]
  (cond
    (nil? v)        "null"
    (string? v)     "a string"
    (boolean? v)    "a boolean"
    (number? v)     "a number"
    (map? v)        "an object"
    (sequential? v) "an array"
    :else           "an unsupported value"))

(defn- argument-error-text
  [arguments field messages]
  (let [texts (->> (tree-seq coll? seq messages) (filter string?) distinct vec)]
    (condp = texts
      ["disallowed key"]       (str "`" (name field) "` is not a supported argument.")
      ["missing required key"] (str "`" (name field) "` is required.")
      (str "`" (name field) "` " (str/join "; " texts)
           (when (every? string? messages)
             (str "; received " (json-type-name (get arguments field))))
           "."))))

(defn- invalid-arguments-message
  "A repair-oriented message describing how `arguments` violate `schema`, or nil when they match."
  [schema arguments]
  (when-let [error (mr/explain schema arguments)]
    (let [humanized (me/humanize error)]
      (str "Invalid tool arguments: "
           (if (map? humanized)
             (str/join " " (for [[field messages] (sort-by (comp name key) humanized)]
                             (argument-error-text arguments field messages)))
             (str "expected an object of named arguments; received "
                  (json-type-name arguments) "."))))))

(def raw-arguments-key
  "The key the stream collector leaves behind when a model's tool-call arguments were not valid JSON.

  Its *presence* is what [[invoke]] reports as `:invalid-json`; the value is the model's own
  malformed output and never reaches a message. Malformed JSON and schema-valid JSON that breaks the
  schema are separate codes because they are separate mistakes, and the repair differs: resend the
  call as an object, versus fix a named argument."
  :_raw_arguments)

(def ^:private invalid-json-message
  "Invalid tool arguments: the arguments were not valid JSON. Send the call again as a JSON object.")

;;; ------------------------------------------------ Rendering -----------------------------------------------------

(defn- unrecoverable-output
  "What the model is told about an unrecoverable failure: the code, and not to retry.

  Nothing else. The user is being shown the real error on another channel, so the model's job here
  is to stop rather than to explain. The code is safe to include because it is ours — a closed
  vocabulary we wrote — and it gives the model something stable to refer to if it says anything at
  all. Note that the model only ever sees this *within the turn*, to pair the remaining tool calls
  of the iteration with results; a turn that ends in an error event is dropped from history whole,
  so later turns never read it."
  [code]
  (str "This call failed and the user was shown the error (" code "). Don't retry it."))

(def ^:private leak-patterns
  "Shapes that mean a raw exception or EDN dump reached agent-bound text: a stack-trace frame,
  Clojure's `#error` printing, a class name, an ANSI escape sequence. Checked in dev and test only —
  in production [[render]] caps the length and trusts the tests."
  [[#"\tat "           "a stack-trace frame"]
   [#"#error \{"       "Clojure's #error printing"]
   [#"clojure\.lang\." "a Clojure class name"]
   [#"\u001b\["        "an ANSI escape sequence"]])

(defn- assert-authored!
  "Check `text` for the shapes that mean an unauthored message leaked through. Dev and test only."
  [text where]
  (doseq [[pattern description] leak-patterns]
    (when (re-find pattern (str text))
      (throw (ex-info (str "Agent-bound text from " where " contains " description
                           ". Tool errors may only carry authored text; log the exception instead.")
                      {:where where})))))

(defn- assert-tool-naming!
  "Check that only recovery steps name tools, and only the ones they declare in `:uses`.

  A `:message` that names a tool is a message written for one profile: the runtime cannot drop a
  message the way it drops a step, so it would reach profiles where that tool does not exist. Dev
  and test only."
  [{:keys [message recovery]} tool-names]
  (doseq [tool-name tool-names
          :when     (tools.error/names-a-tool? message tool-name)]
    (throw (ex-info (str "A recoverable error's :message names the tool `" tool-name
                         "`. Only recovery steps name tools, so that a profile without the tool "
                         "loses the advice instead of the whole message.")
                    {:tool-name tool-name})))
  (doseq [{:keys [uses text]} recovery
          tool-name           tool-names
          :when               (and (tools.error/names-a-tool? text tool-name)
                                   (not (contains? uses tool-name)))]
    (throw (ex-info (str "A recovery step names the tool `" tool-name "` without declaring it in "
                         ":uses, so it would survive into a profile that has no such tool.")
                    {:uses uses :tool-name tool-name}))))

(def ^:private max-output-length
  "A cap on agent-bound failure text. A declared error should be nowhere near this; the cap is here
  so that a pathological payload cannot spend the turn's context on one failure."
  4000)

(defn render
  "The failure [[::outcome]] for a ToolError, given the tool names available this turn.

  | Class            | `:output`                                                 |
  | ---------------- | --------------------------------------------------------- |
  | `:validation`    | the message                                               |
  | `:recoverable`   | the message, then each kept recovery step on its own line  |
  | `:unrecoverable` | a fixed sentence carrying only the code                    |

  `:user-message` is copied onto the outcome for unrecoverable errors so the agent loop can show it
  to the user. It never becomes part of `:output`."
  [{:keys [class code message recovery user-message]} tool-names]
  (let [output (case class
                 :validation  message
                 ;; The same assembly an item's failure gets, so a `not-found!` reads identically
                 ;; whether it ended the call or was one of several things the call tried.
                 :recoverable (tools.error/recoverable-text {:message message :recovery recovery}
                                                            tool-names)
                 (unrecoverable-output code))]
    (when (or config/is-dev? config/is-test?)
      (assert-authored! output (str class " " code))
      (when (= class :recoverable)
        (assert-tool-naming! {:message message :recovery recovery} tool-names)))
    {:output (cond-> output
               (< max-output-length (count output)) (subs 0 max-output-length))
     :error  (cond-> {:class class :code code}
               user-message (assoc :user-message user-message))}))

;;; ------------------------------------------------ Invocation ----------------------------------------------------

(defn- validation-ex
  "The exception for one of the runtime's validation errors. Thrown rather than returned so that all
  seven steps of [[invoke]] leave by the same door."
  ^Throwable [code message]
  (ex-info message {tools.error/error-key {:class :validation :code code :message message}}))

(defn- unknown-tool-ex
  ^Throwable [tool-name entries]
  (validation-ex :unknown-tool
                 (str "Tool `" tool-name "` does not exist. Available tools: "
                      (str/join ", " (sort (keys entries))) ".")))

(defn- check-scope!
  "Throw an unrecoverable `:scope-denied` error when the current user's scope does not cover the
  tool's declaration.

  Unrecoverable rather than recoverable: the agent cannot acquire a scope, so there is no alternative
  path to offer it, and a profile that lists a tool the user may not call is a configuration problem
  the user needs to see. The message names the tool because that is the actionable part — it says
  which permission to ask for."
  [{tool-name :name :keys [scope]}]
  (when (and scope (not (api-scope/scope-matches? scope/*current-user-scope* scope)))
    (log/warnf "Scope check failed for tool %s — required: %s, granted: %s"
               tool-name scope scope/*current-user-scope*)
    (tools.error/unrecoverable! :scope-denied
                                {:user-message (tru "You don''t have permission to use the {0} tool."
                                                    tool-name)
                                 :data         {:tool-name tool-name :scope scope}})))

(defn- validated-args
  "`args` coerced and checked against the declaration's `:args` schema. Throws a validation error
  otherwise."
  [{:keys [args]} arguments]
  (when (and (map? arguments) (contains? arguments raw-arguments-key))
    (throw (validation-ex :invalid-json invalid-json-message)))
  (let [coerced (coerce-stringified-scalars args arguments)]
    (when-let [message (invalid-arguments-message args coerced)]
      (throw (validation-ex :invalid-arguments message)))
    coerced))

(defn- call-tool
  "Call `tool` with `args` and `ctx`, with the dynamic vars bound from `ctx`.

  `tools.core/call` is the whole of it: whether this tool does one item or several is its own
  business, and the orchestration for the batched case lives in `tools.core` where every consumer
  shares it. This namespace never asks which kind it has.

  The vars are bound as well as the ctx passed because code a tool reaches *through* does not take a
  ctx — `metabase.metabot.tools.shared.content-store`, which the representations pipeline uses, reads
  the vars. Tools themselves read ctx."
  [tool args {:keys [metabot-id profile-id memory-atom] :as ctx}]
  (binding [shared/*metabot-id*  metabot-id
            shared/*profile-id*  profile-id
            shared/*memory-atom* memory-atom]
    (tools/call tool args ctx)))

(defn- rendered-output
  "`result` with its `:output` rendered to a string.

  The boundary where a renderable becomes text. A tool may return either; this consumer wants a
  string, and another consumer would render the same value its own way — that is the whole point of
  `tools.core/Renderable`."
  [result]
  (update result :output tools/render-text))

(defn- checked-result
  "`result` if it is a valid [[::handler-result]]; otherwise an unrecoverable `:internal` error.

  A handler that returns the wrong shape is a bug in our code, not something to teach the model
  about, so the explanation goes to the log and the model is told only that the call failed."
  [tool-name result]
  (if (mr/validate ::tools/result result)
    result
    (do
      (log/errorf "Tool %s returned an invalid result: %s"
                  tool-name (some-> (mr/explain ::tools/result result) me/humanize pr-str))
      (tools.error/unrecoverable! :internal {:data {:tool-name tool-name}}))))

(defn- log-failure!
  "Log `e` in full, at the level its class deserves. Validation and recoverable errors are the agent
  working as designed; only unrecoverable ones are faults."
  [tool-name {:keys [class code]} ^Throwable e]
  (if (= class :unrecoverable)
    (log/error e "Tool call failed" {:tool-name tool-name :code code})
    (log/debugf "Tool %s: %s error %s: %s" tool-name (name class) code (ex-message e))))

(defn invoke
  "Run the tool `tool-name` from `entries` with `args`, and return an [[::outcome]].

  `entries` is one profile's map of tool name to `{:declaration … :tool …}` (see
  `tools.core/entries`); `args` are the arguments after JSON parsing. Never throws — every failure comes back as a failure outcome, because the caller has
  to pair each `tool_use` with a `tool_result` and an escaping exception would break that pairing.

  In order:
  1. an unknown `tool-name` is a validation error listing what this profile does have;
  2. arguments that were not valid JSON are a validation error (see [[raw-arguments-key]]);
  3. stringified scalars are coerced, then the arguments are validated against `:args`;
  4. the scope is checked, and a denial is unrecoverable;
  5. the tool runs with the dynamic vars bound from `ctx`, through `tools.core/call`;
  6. its result is validated against `tools.core/result` and its `:output` rendered to a string;
  7. any exception is classified, logged in full, and rendered for its audience."
  [entries ctx tool-name args]
  (let [tool-names (:tool-names ctx)]
    (try
      (let [{:keys [declaration tool]} (or (get entries tool-name)
                                           (throw (unknown-tool-ex tool-name entries)))
            checked                     (validated-args declaration args)]
        (check-scope! declaration)
        (-> (call-tool tool checked ctx)
            (->> (checked-result tool-name))
            rendered-output))
      (catch Throwable e
        (let [error (tools.error/classify e)]
          (log-failure! tool-name error e)
          (render error tool-names))))))
