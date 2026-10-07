(ns metabase.metabot.tools.error
  "The ToolError domain: what a Metabot tool failure *is*, before anything decides where it goes.

  A tool failure has exactly one class, and the class picks the audience:

  | Class            | Produced by                      | Handled by | Carries          |
  | ---------------- | -------------------------------- | ---------- | ---------------- |
  | `:validation`    | the runtime only                 | the agent  | `:message`       |
  | `:recoverable`   | a [[defrecoverable]] constructor | the agent  | `:message`, `:recovery` |
  | `:unrecoverable` | everything else                  | the user   | `:user-message`? |

  Recoverable is opt-in and unrecoverable is the default, so the safe path is the one you get by
  doing nothing: an exception nobody declared recoverable ends the turn rather than handing the
  model text that nobody wrote for it. An unrecoverable error has no `:message` key at all, which
  makes forwarding a foreign exception message to the agent impossible rather than merely
  discouraged.

  Each recoverable error is declared once with [[defrecoverable]], which records it in the catalog
  here. The catalog is what lets one test cover every declared error, and what lets a converter
  (see `metabase.metabot.tools.core`) turn a foreign error into a declared one by code.

  This namespace is the bottom of the tool-error stack: it knows about classes, codes and payload
  schemas, and nothing about tools, profiles or rendering. `metabase.metabot.tools.runtime` decides
  what text each audience actually receives."
  (:require
   [clojure.string :as str]
   [malli.error :as me]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Schemas --------------------------------------------------------

(mr/def ::recovery-step
  "One alternative path offered to the agent after a recoverable failure.

  `:uses` is the set of tool names `:text` mentions. The runtime keeps a step only when the current
  profile has all of them, so a step naming `read_resource` silently disappears in a profile without
  it instead of sending the agent at a tool it cannot call."
  [:map {:closed true}
   [:uses [:set :string]]
   [:text :string]])

(mr/def ::tool-error
  "A tool failure as data. The `:class` decides the audience; see the namespace docstring.

  `:message` and recovery text are model-facing: write them in English, do not use `tru`.
  `:user-message` is user-facing and should use `tru`.

  `:data` on a recoverable error is the validated payload, which logs and evals read. `:data` on an
  unrecoverable error reaches the logs only."
  [:multi {:dispatch :class}
   [:validation    [:map {:closed true}
                    [:class   [:= :validation]]
                    [:code    :keyword]
                    [:message :string]]]
   [:recoverable   [:map {:closed true}
                    [:class    [:= :recoverable]]
                    [:code     :qualified-keyword]
                    [:message  :string]
                    [:recovery [:sequential ::recovery-step]]
                    [:data     :map]]]
   [:unrecoverable [:map {:closed true}
                    [:class        [:= :unrecoverable]]
                    [:code         :keyword]
                    [:user-message {:optional true} :string]
                    [:data         {:optional true} :map]]]])

(mr/def ::recoverable-body
  "What a [[defrecoverable]] body returns: the model-facing text for this failure."
  [:map {:closed true}
   [:message  :string]
   [:recovery [:sequential ::recovery-step]]])

(def error-key
  "The `ex-data` key a ToolError travels under.

  Spelled out as a var because three layers have to agree on it — the constructors here, the
  runtime's `classify`, and the tests — and a typo'd keyword would silently demote every error to
  `:internal`."
  ::error)

;;; ------------------------------------------ Throwing ------------------------------------------------------------

(defn- explanation
  "A human-readable account of how `value` violates `schema`, for the logs. Never model- or
  user-facing: it quotes the offending value verbatim."
  [schema value]
  (try
    (some-> (mr/explain schema value) me/humanize pr-str)
    (catch Throwable _
      "<unexplainable>")))

(defn unrecoverable-ex
  "The exception for an unrecoverable ToolError with `code`.

  `opts` may carry `:user-message` (the only text the user ever sees for this failure), `:data`
  (logs only) and `:cause`. The exception message is the `:user-message` when there is one, and the
  code otherwise — there is deliberately no `:message` key on the error itself, so nothing
  downstream can hand this text to the model.

  Unlike recoverable errors there is no `:agent-error?` flag: code outside the agent loop that
  catches these should treat them as the server faults they are."
  ^Throwable [code {:keys [user-message data cause]}]
  (let [error (cond-> {:class :unrecoverable :code code}
                user-message (assoc :user-message user-message)
                (seq data)   (assoc :data data))]
    (ex-info (or user-message (str code))
             {error-key error}
             cause)))

(defn unrecoverable!
  "Throw an unrecoverable ToolError with `code`, ending the turn.

  Always throws; never returns. Tool code passes a qualified keyword, so the log and the
  model-facing template both say which namespace gave up; the runtime's own codes are an
  unqualified closed set (`metabase.metabot.tools.runtime/runtime-codes`).

    (unrecoverable! ::no-sql-permission)
    (unrecoverable! ::no-sql-permission
                    {:user-message (tru \"You can''t write SQL for this database.\")
                     :cause        e
                     :data         {:database-id database-id}})

  `:user-message` is the only way to show the user something specific to this failure; without it
  they get the generic message. Unrecoverable errors are not declared anywhere, because the only
  authored text they carry is that one optional string."
  ([code] (unrecoverable! code nil))
  ([code opts]
   (throw (unrecoverable-ex code opts))))

;;; ------------------------------------------ Recoverable catalog -------------------------------------------------

(defonce ^:private recoverables*
  (atom {}))

(defn recoverables
  "The declared recoverable errors, as a map of code to catalog entry.

  An entry has `:code`, `:var`, `:doc`, `:payload-schema`, `:status-code` and `:build-fn`. Tests
  walk this to cover every declared error at once, and converters look an error up by code."
  []
  @recoverables*)

(defn declare-recoverable!
  "Record one recoverable error in the catalog. [[defrecoverable]] calls this; call it directly only
  if you are building another declaration macro on top.

  Rejects a second declaration of the same `code` from a *different* var, which would otherwise let
  load order decide which text the agent sees. Comparison is by the var's fully-qualified symbol
  rather than by identity, because reloading a namespace in the REPL mints a fresh var for the same
  name and an identity check would reject the reload."
  [{:keys [code var payload-schema] :as entry}]
  (when-not (qualified-keyword? code)
    (throw (ex-info "A recoverable error code must be a qualified keyword" {:code code})))
  (when-not (var? var)
    (throw (ex-info (str "Recoverable error " code " must be declared with its constructor var")
                    {:code code :var var})))
  (when-not payload-schema
    (throw (ex-info (str "Recoverable error " code " declared without a payload schema") {:code code})))
  ;; Fail at load time rather than when the error first fires: a declaration whose schema does not
  ;; compile would otherwise turn every use of it into an `:internal` error in production.
  (mr/schema payload-schema)
  (when-let [existing (get @recoverables* code)]
    (when-not (= (symbol (:var existing)) (symbol var))
      (throw (ex-info (str "Recoverable error " code " is already declared by " (symbol (:var existing)))
                      {:code code :existing (symbol (:var existing)) :duplicate (symbol var)}))))
  (swap! recoverables* assoc code entry)
  code)

(defn- recoverable-ex
  "The exception for a recoverable ToolError, given a validated `payload` and the `:message`/
  `:recovery` its declaration produced.

  The ex-data carries `:agent-error?` and `:status-code` as well as the ToolError, so the existing
  callers of shared tool helpers that live outside the agent loop — MCP v2's `search` calling
  `metabase.metabot.tools.search/search`, for instance — keep seeing the shape they handle today."
  ^Throwable [code {:keys [message recovery]} payload status-code cause]
  (ex-info message
           {error-key     {:class    :recoverable
                           :code     code
                           :message  message
                           :recovery (vec recovery)
                           :data     payload}
            :agent-error? true
            :status-code  status-code}
           cause))

(defn throw-recoverable!
  "Throw the declared recoverable error `code`, built from `payload`.

  Always throws. `opts` may carry `:cause`, which reaches the logs only. This is the catalog-driven
  entry point, for code that knows an error by its code rather than by its var — the converters in
  `metabase.metabot.tools.core`, which map a foreign error onto a declaration. Tool code calls the
  constructor var that [[defrecoverable]] defined instead.

  A payload that does not match the declaration's schema, or a body that returns something other
  than `::recoverable-body`, throws an unrecoverable `:internal` error instead: a malformed
  recoverable error must never reach the agent, and the alternative is unauthored text. Validation
  runs in every environment, not just dev and test like `mu/defn`, because that guarantee is the
  whole point."
  ([code payload] (throw-recoverable! code payload nil))
  ([code payload {:keys [cause]}]
   (let [{:keys [payload-schema status-code build-fn] :as entry} (get (recoverables) code)]
     (when-not entry
       (throw (unrecoverable-ex :internal {:data  {:code code}
                                           :cause (ex-info (str "No recoverable error declared for " code)
                                                           {:code code})})))
     (when-not (mr/validate payload-schema payload)
       (log/errorf "Recoverable error %s built with an invalid payload: %s"
                   code (explanation payload-schema payload))
       (throw (unrecoverable-ex :internal {:data  {:code code :payload payload}
                                           :cause cause})))
     (let [body (build-fn payload)]
       (when-not (mr/validate ::recoverable-body body)
         (log/errorf "Recoverable error %s produced an invalid body: %s"
                     code (explanation ::recoverable-body body))
         (throw (unrecoverable-ex :internal {:data  {:code code :payload payload}
                                             :cause cause})))
       (throw (recoverable-ex code body payload status-code cause))))))

(defn code-for
  "The error code [[defrecoverable]] gives a constructor named `sym` in namespace `ns-name`: the
  qualified keyword of the name without its trailing `!`."
  [ns-name sym]
  (keyword (str ns-name) (str/replace (name sym) #"!$" "")))

(defmacro defrecoverable
  "Declare one recoverable error and define its constructor.

    (defrecoverable unknown-query-id!
      \"The query id is not in this conversation's query state.\"
      {:payload [:map {:closed true}
                 [:query-id  :string]
                 [:available [:sequential :string]]]}
      [{:keys [query-id available]}]
      {:message  (str \"Query \" query-id \" not found. Available query ids: \"
                      (str/join \", \" available) \".\")
       :recovery []})

  The name ends with `!` because the constructor always throws; it never returns a value to test
  against. The code is the qualified keyword of the name without the `!`, so the example above is
  `:metabase.metabot.tools.sql/unknown-query-id`.

  `opts` is a map of:
  - `:payload` - *required* - Malli schema for the payload the call site passes. Validated on every
    call, in every environment.
  - `:status-code` - *optional*, default 400 - the `:status-code` on the thrown `ex-info`, for the
    non-agent callers of shared tool helpers.

  The body receives the validated payload and returns `{:message ... :recovery [...]}`. Write both
  in English: they are model-facing, not user-facing. Only recovery steps name tools, and each step
  declares the tools its text mentions in `:uses` so the runtime can drop steps the current profile
  cannot act on.

  The argument vector holds the payload binding alone. The shape — name, docstring, options map,
  argument vector, body — is `defn`'s, which is what lets clj-kondo lint this as a `defn` without a
  hook, and matches `metabase.mcp.v2.registry/deftool`."
  {:style/indent [:defn]}
  [sym docstring opts argv & body]
  (assert (string? docstring) "defrecoverable requires a docstring")
  (assert (map? opts) "defrecoverable requires an options map")
  (assert (and (vector? argv) (= 1 (count argv)))
          "defrecoverable takes exactly one argument, the payload")
  (assert (str/ends-with? (name sym) "!") "a defrecoverable name must end with !")
  (let [code (code-for *ns* sym)]
    ;; The constructor takes the payload through untouched and lets `throw-recoverable!` validate it
    ;; against the catalog, so `argv`'s destructuring applies to the body only — one place decides
    ;; what a valid payload is, whether the error was raised through the var or by code.
    `(do
       (defn ~sym ~docstring [payload#]
         (throw-recoverable! ~code payload#))
       (declare-recoverable! {:code           ~code
                              :var            (var ~sym)
                              :doc            ~docstring
                              :payload-schema ~(:payload opts)
                              :status-code    ~(:status-code opts 400)
                              :build-fn       (fn ~argv ~@body)}))))

;;; ------------------------------------------ Classification ------------------------------------------------------

(defn classify
  "The ToolError for `e`.

  An exception carrying [[error-key]] in its ex-data keeps the class its producer chose; everything
  else is unrecoverable `:internal`. Reads the top-level exception only and does not walk the cause
  chain, so wrapping a declared error in an undeclared one demotes it — which is the safe
  direction."
  [e]
  (or (get (ex-data e) error-key)
      {:class :unrecoverable :code :internal}))
