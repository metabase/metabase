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
  raised it. The runtime's own codes are a closed, unqualified vocabulary, [[runtime-codes]].
  Every unrecoverable failure ends the turn except `:internal`, the code of an ordinary exception no
  tool declared: the agent loop lets a turn survive one of those, or none when its profile requires
  a tool call. A tool that writes gets none either: its undeclared failure is an [[unconfirmed-write]]."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [malli.util :as mut]
   [metabase.api-scope.core :as api-scope]
   [metabase.config.core :as config]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.shared :as shared]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p])
  (:import
   (com.fasterxml.jackson.core JsonProcessingException)
   (com.fasterxml.jackson.core.io JsonEOFException)))

(set! *warn-on-reflection* true)

;; Declared in `tools.error` so that the declarations this namespace loads can budget against the same limit
(p/import-vars
 [tools.error
  max-output-length
  output-budget])

(def runtime-codes
  "Every error code the runtime itself produces, with the class each one takes.

  Written down as data so the agent loop, the adapters and the tests share one list rather than
  three sets of literal keywords."
  {:unknown-tool       :validation
   :invalid-arguments  :validation
   :scope-denied       :unrecoverable
   :internal           :unrecoverable
   :jvm-error          :unrecoverable
   :interrupted        :unrecoverable
   :unconfirmed-write  :unrecoverable})

(defn undeclared?
  "Whether `code` is `:internal`, the code of an ordinary exception that no tool declared."
  [code]
  (= :internal code))

(defn- unconfirmed-write
  "The ToolError to report for `error` from a tool whose declaration sets `:metabot/writes?`.

  A failure that no tool declared, coded by `tools.error/classify`, may have come after the write. It
  becomes `:unconfirmed-write`, which ends the turn and tells the user to check before trying again,
  so the model can't write a second time. A declared error passes through unchanged."
  [{:keys [code] :as error}]
  (if (#{:internal :jvm-error :interrupted} code)
    {:class        :unrecoverable
     :code         :unconfirmed-write
     :user-message (tru "Something went wrong. The change may have been saved, so check before you try again.")}
    error))

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
   ;; The scope set granted to the user this turn. Passed rather than read from
   ;; `metabase.metabot.scope/*current-user-scope*` because requiring that namespace from here is a
   ;; load cycle: it reaches the provider adapters through `metabot.settings`, and those require
   ;; `metabase.metabot.self.core`, which requires this namespace. `tools/->entries` reads the var
   ;; once per turn, inside the request, and puts it here.
   [:user-scope  [:set :string]]
   ;; The resolved Metabot row, not an id: `tools.shared/*metabot*` carries the row so a tool can
   ;; scope a query to that metabot's collection.
   [:metabot     [:maybe :map]]
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

(defn json-text?
  "Whether `v` is a string that looks like a JSON object or array, ignoring surrounding whitespace."
  [v]
  (and (string? v)
       (let [trimmed (str/trim v)]
         (or (str/starts-with? trimmed "{")
             (str/starts-with? trimmed "[")))))

(defn- json-text-error
  "What is wrong with the JSON text `s`, such as `the text ends before the JSON is complete`, or nil when it parses."
  [^String s]
  (try
    (json/decode s)
    nil
    (catch JsonEOFException _
      "the text ends before the JSON is complete")
    (catch JsonProcessingException e
      ;; The location is missing for some failures, such as a number too long to read. It can also sit just after
      ;; the bad token (`NaN` is reported at the following character), so it is given as "near".
      (if-let [location (.getLocation e)]
        (str "the text is not valid JSON near line " (.getLineNr location) ", column " (.getColumnNr location))
        "the text is not valid JSON"))
    ;; Parse failures arrive as JsonProcessingException, so this is only a backstop that keeps a surprise from
    ;; turning a type error into an internal failure.
    (catch Exception _
      "the text is not valid JSON")))

(defn- argument-path
  "The path `in` into a tool's arguments, written the way the model would name it, such as `ops[1].card_id`."
  [in]
  (reduce (fn [text k]
            (if (int? k)
              (str text "[" k "]")
              (str text (when (seq text) ".") (u/qualified-name k))))
          ""
          in))

(defn- code
  "The argument path `in`, written as [[argument-path]] does, in backticks."
  [in]
  (str "`" (argument-path in) "`"))

(defn- compare-paths
  "Orders two argument paths part by part, so that list indexes compare as numbers: `ops[2]` comes before `ops[10]`."
  [a b]
  (or (some (fn [[x y]]
              (let [c (if (and (int? x) (int? y))
                        (compare x y)
                        (compare (str x) (str y)))]
                (when-not (zero? c) c)))
            (map vector a b))
      (compare (count a) (count b))))

(defn- field-names
  "The fields below the argument at the path `in` that `errors` are about, such as `` `hour`, `day_of_week` ``."
  [in errors]
  (str/join ", " (for [error-in (distinct (map :in errors))]
                   (code (subvec error-in (count in))))))

(defn- agreeing
  "The predicate `text` for one argument as `:one`, and its form for several as `:many`."
  [text]
  {:one text, :many (str/replace-first text #"^is " "are ")})

(defn- clause
  "The predicate `text` after the verb `one` for one argument and `many` for several."
  [one many text]
  {:one (str one " " text), :many (str many " " text)})

(defn- problem
  "What is wrong with the argument at the path `in`, given the Malli `errors` reported under it, as a predicate for one
  argument (`:one`) and for several (`:many`), such as \"is required.\" and \"are required.\"."
  [arguments in errors]
  ;; Errors reported deeper than `in` come from inside a value of the right type, under an `:or`.
  (let [about-value? (every? #(= in (:in %)) errors)
        texts        (distinct (map :text errors))
        value        (get-in arguments in)
        ;; Only quoted JSON text that does not parse gets this message: saying where it breaks gives the model
        ;; something to fix, and a type error alone gets the same call again. Text that parses was decoded before the
        ;; tool ran, except inside a list, where it keeps the type error.
        json-error   (when (and about-value? (= texts ["invalid type"]) (json-text? value))
                       (json-text-error value))]
    (cond
      (and about-value? (= texts ["disallowed key"]))
      {:one "is not a supported argument.", :many "are not supported arguments."}

      (and about-value? (= texts ["missing required key"]))
      {:one "is required.", :many "are required."}

      json-error
      {:one  (str "was sent as a string of JSON text, and " json-error
                  ". Fix the JSON and send the value itself, not a quoted string.")
       :many (str "were sent as strings of JSON text, and " json-error
                  ". Fix the JSON and send the values themselves, not quoted strings.")}

      about-value?
      (agreeing (str (str/join "; " texts) "; received " (json-type-name value) "."))

      :else
      ;; One clause per kind of error, naming the fields that missing and unsupported keys are about.
      (let [clauses (for [text texts
                          :let [text-errors (filter #(= text (:text %)) errors)]]
                      (case text
                        ;; The alternatives of an `:or` each need some of these fields, not all of them.
                        "missing required key"
                        (clause "is" "are" (str "missing required fields, from among " (field-names in text-errors)))

                        "disallowed key"
                        (clause "has" "have" (str "unsupported fields: " (field-names in text-errors)))

                        (agreeing text)))]
        {:one  (str (str/join "; " (map :one clauses)) ".")
         :many (str (str/join "; " (map :many clauses)) ".")}))))

(defn- enumerate
  "Two or more `labels` written as a list, such as \"a, b and c\".
  Past three, it names the first three and counts the rest: \"a, b, c and 4 more\"."
  [labels]
  (let [n (count labels)]
    (if (< 3 n)
      (str (str/join ", " (take 3 labels)) " and " (- n 3) " more")
      (str (str/join ", " (butlast labels)) " and " (last labels)))))

(defn- problem-sentences
  "One sentence per problem in `problems`, each a map of an argument path `:in` and its [[problem]].

  The same problem at the same place in several elements of a list is one sentence, such as \"`ids[0]`, `[1]`, `[2]`
  and 7 more should be an integer; received a string.\" or \"`ops[0].card_id`, `ops[1].card_id` and `ops[4].card_id`
  should be an integer; received a string.\", so a mistake the model repeated across a long list does not crowd out
  the others."
  [problems]
  (let [group-key (fn [{:keys [in problem]}]
                    (if (some int? in)
                      [(mapv #(if (int? %) ::index %) in) problem]
                      [in]))]
    (for [[{:keys [in problem]} & more :as group] (sort-by (comp :in first) compare-paths
                                                           (vals (group-by group-key problems)))]
      (if (empty? more)
        (str (code in) " " (:one problem))
        ;; The first by its full path. The rest by index alone when they are elements of the same list, and by full
        ;; path when the problem is inside each element.
        (let [same-list? (and (int? (peek in)) (apply = (map (comp pop :in) group)))]
          (str (enumerate (cons (code in)
                                (for [{other :in} more]
                                  (if same-list?
                                    (str "`[" (peek other) "]`")
                                    (code other)))))
               " " (:many problem)))))))

(def ^:private max-sentences-per-argument
  "How many sentences the errors of one top-level argument get, so that one bad argument cannot push the others past
  [[max-output-length]]."
  5)

(defn- capped-sentences
  "The [[problem-sentences]] for `problems`, which are all about one top-level argument.
  Those past [[max-sentences-per-argument]] are counted instead."
  [problems]
  (let [[kept dropped] (split-at max-sentences-per-argument (problem-sentences problems))]
    (cond-> (vec kept)
      (seq dropped) (conj (str "And " (count dropped) (if (= 1 (count dropped)) " more problem" " more problems")
                               " in " (code [(-> problems first :in first)]) ".")))))

(defn- reported-path
  "The argument path to report the Malli `error` under: the data path of the outermost `:or` the error is inside, with
  the error's own list indexes, or else the error's own path."
  [schema {:keys [in path]}]
  ;; An `:or` that fails reports the errors of every alternative, which contradict each other below it, so they all
  ;; go under the `:or`'s own path.
  (let [in   (vec in)
        path (vec path)]
    (or (some (fn [n]
                (let [prefix (subvec path 0 n)]
                  (when (#{:or :orn} (some-> (mut/get-in schema prefix) mc/type))
                    ;; The schema path has no list indexes, so the error's own data path is cut to the `:or`'s depth.
                    (subvec in 0 (min (count in) (count (mut/path->in schema prefix)))))))
              (range (inc (count path))))
        in)))

(defn- problems
  "The problems in `arguments` that the Malli `explanation` describes, one per argument path, sorted by path. Each is a
  map of the path `:in` and its [[problem]]."
  [arguments {:keys [schema errors]}]
  (let [by-path (group-by :reported
                          (for [error errors]
                            {:reported (reported-path schema error)
                             :in       (vec (:in error))
                             :text     (or (me/error-message error {:unknown false}) "is not valid")}))]
    (for [in (sort compare-paths (keys by-path))]
      {:in in, :problem (problem arguments in (by-path in))})))

(defn- invalid-arguments-message
  "A repair-oriented message describing how `arguments` violate `schema`, or nil when they match.
  Each problem names the argument it is about by its full path, such as `ops[1].card_id`."
  [schema arguments]
  (when-let [explanation (mr/explain schema arguments)]
    (str "Invalid tool arguments: "
         (if (map? arguments)
           (str/join " " (mapcat capped-sentences
                                 (partition-by (comp first :in) (problems arguments explanation))))
           (str "expected an object of named arguments; received " (json-type-name arguments) ".")))))

;;; ------------------------------------------------ Rendering -----------------------------------------------------

(def ^:private undeclared-failure-sentence
  "How the model's text about an ordinary exception that no tool declared starts, and all that a later
  turn replays of it (see [[replay-text]])."
  "This call failed with an unexpected error.")

(defn- unrecoverable-output
  "What the model is told about an unrecoverable failure, which never includes the failure's own text.

  `:internal` is an ordinary exception that no tool declared. The agent loop can carry on after one,
  so the model is told to try another way rather than make the same call again.

  For any other code the user is shown the real error on another channel, so the model's job is to
  stop rather than to explain. The code is safe to include because it is ours, a closed vocabulary
  we wrote, and it gives the model something stable to refer to if it says anything at all."
  [code]
  (if (undeclared? code)
    (str undeclared-failure-sentence " Don't retry the same call. Try another approach, or tell the user it failed.")
    (str "This call failed and the user was shown the error (" code "). Don't retry it.")))

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

(defn render
  "The failure [[::outcome]] for a ToolError, given the tool names available this turn.

  | Class            | `:output`                                                 |
  | ---------------- | --------------------------------------------------------- |
  | `:validation`    | the message                                               |
  | `:recoverable`   | the message, then each kept recovery step on its own line  |
  | `:unrecoverable` | a fixed sentence, with the code unless it is `:internal`  |

  Failure text is capped at [[max-output-length]] characters.

  `:user-message` is copied onto the outcome for unrecoverable errors so the agent loop can show it
  to the user. It never becomes part of `:output`."
  [{:keys [class code message recovery user-message] :as error} tool-names]
  (let [output (case class
                 :validation  message
                 ;; The same assembly an item's failure gets, so a `not-found!` reads identically
                 ;; whether it ended the call or was one of several things the call tried.
                 :recoverable (tools.error/recoverable-text {:message message :recovery recovery}
                                                            tool-names)
                 (unrecoverable-output code))]
    (when (or config/is-dev? config/is-test?)
      ;; Only the authored-text check runs here. Whether a declaration's message names a tool is a
      ;; property of the declaration, not of this call, so it is checked once over the whole catalog
      ;; in `metabase.metabot.tools.error-test` rather than on every render — which also means this
      ;; path needs no exemption for `tools.core/all-items-failed`, whose message is not authored at
      ;; all but assembled from text each item already had filtered for this profile.
      (assert-authored! (if (= :recoverable class)
                          (tools.error/authored-text error output)
                          output)
                        (str class " " code)))
    {:output (cond-> output
               (< max-output-length (count output)) (subs 0 max-output-length))
     :error  (cond-> {:class class :code code}
               user-message (assoc :user-message user-message))}))

(defn replay-text
  "The text that a later turn replays to the model for the failure [[::outcome]] `outcome`.

  An ordinary exception that no tool declared replays as one neutral sentence. Its live text also
  tells the model not to make the same call again, and that holds only for the turn that failed: by a
  later turn the cause may be gone. Every other failure replays the text the model read live."
  [{:keys [output error]}]
  (if (undeclared? (:code error))
    undeclared-failure-sentence
    output))

;;; ------------------------------------------------ Invocation ----------------------------------------------------

(defn- validation-ex
  "The exception for one of the runtime's validation errors. Thrown rather than returned so that all
  six steps of [[invoke]] leave by the same door."
  ^Throwable [code message]
  (ex-info message {tools.error/error-key {:class :validation :code code :message message}}))

(defn- unknown-tool-message
  [tool-name tool-names]
  (str "Tool `" tool-name "` does not exist. Available tools: "
       (str/join ", " (sort tool-names)) "."))

(defn- unknown-tool-ex
  ^Throwable [tool-name entries]
  (validation-ex :unknown-tool (unknown-tool-message tool-name (keys entries))))

(defn unknown-tool-outcome
  "The failure [[::outcome]] for a call to a tool that is not in `tool-names`.

  Public because the agent's `run-tool` resolves the entry before it has anything to invoke, so it
  reaches this directly rather than through [[invoke]]. One definition of the message either way."
  [tool-name tool-names]
  (render {:class   :validation
           :code    :unknown-tool
           :message (unknown-tool-message tool-name tool-names)}
          tool-names))

(defn- check-scope!
  "Throw an unrecoverable `:scope-denied` error when the current user's scope does not cover the
  tool's declaration.

  Unrecoverable rather than recoverable: the agent cannot acquire a scope, so there is no alternative
  path to offer it, and a profile that lists a tool the user may not call is a configuration problem
  the user needs to see. The message names the tool because that is the actionable part — it says
  which permission to ask for."
  [{tool-name :name :keys [scope]} user-scope]
  (when (and scope (not (api-scope/scope-matches? user-scope scope)))
    (log/warnf "Scope check failed for tool %s — required: %s, granted: %s"
               tool-name scope user-scope)
    (tools.error/unrecoverable! :scope-denied
                                {:user-message (tru "You don''t have permission to use the {0} tool."
                                                    tool-name)
                                 :data         {:tool-name tool-name :scope scope}})))

(defn- validated-args
  "`args` coerced and checked against the declaration's `:args` schema. Throws a validation error
  otherwise."
  [{:keys [args]} arguments]
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
  [tool args {:keys [metabot profile-id memory-atom] :as ctx}]
  (binding [shared/*metabot*     metabot
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
  2. stringified scalars are coerced, then the arguments are validated against `:args`;
  3. the scope is checked, and a denial is unrecoverable;
  4. the tool runs with the dynamic vars bound from `ctx`, through `tools.core/call`;
  5. its result is validated against `tools.core/result` and its `:output` rendered to a string;
  6. any exception is classified, logged in full, and rendered for its audience; a tool that writes
     has a failure no tool declared reported as an [[unconfirmed-write]]."
  [entries ctx tool-name args]
  (let [tool-names (:tool-names ctx)]
    (try
      (let [{:keys [declaration tool]} (or (get entries tool-name)
                                           (throw (unknown-tool-ex tool-name entries)))
            checked                     (validated-args declaration args)]
        (check-scope! declaration (:user-scope ctx))
        (-> (call-tool tool checked ctx)
            (->> (checked-result tool-name))
            rendered-output))
      (catch Throwable e
        (let [error (cond-> (tools.error/classify e)
                      (get-in entries [tool-name :declaration :metabot/writes?]) unconfirmed-write)]
          (log-failure! tool-name error e)
          (render error tool-names))))))
