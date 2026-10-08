(ns metabase.metabot.tools.legacy
  "Makes a tool written against the old shape satisfy `metabase.metabot.tools.core/Tool`.

  A tool used to be an `mu/defn` var carrying `:tool-name`, `:schema` and friends in its metadata,
  called with one argument and returning a loose result: a string, or a map with any of `:output`,
  `:structured-output`, `:structured_output`, `:instructions`, `:terminal-error?`, `:status-code`,
  `:data-parts`, `:resources`. Errors came back as a success-shaped `{:output \"…\"}` or escaped as
  an `ex-info` with `:agent-error?` or `:terminal-error?` in its ex-data.

  Extending `Tool` to `clojure.lang.Var` turns all of that into the new contract at the boundary. The
  consequence is that no converted and unconverted tool ever meet: a profile lists both, `tools/call`
  calls both, the runtime knows neither. Tools are converted one at a time and nothing has to happen
  on a single day.

  Behaviour is preserved rather than improved. An unconverted tool that returns a success-shaped
  failure still looks like a success, because nothing here can tell `{:output \"Failed to read the
  card\"}` from `{:output \"<card>…</card>\"}`. That is the thing conversion fixes, one tool at a
  time.

  Require this namespace wherever unconverted tools are registered. Without it a legacy var does not
  satisfy the protocol, and `tools.core/entries` fails loudly rather than silently skipping it.

  This namespace is deleted when the last tool is converted."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.recoverable.legacy :as recoverable.legacy]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Declaration ---------------------------------------------------

(defn- description
  "`doc` with the `Inputs: …` / `Return: …` preamble `mu/defn` prepends to a docstring removed.

  The same strip `metabase.metabot.self.schema/tool-function` does today. It moves here because the
  description is part of the declaration, and a converted tool's description needs no stripping at
  all — so the adapters stop needing this once the last tool is converted."
  [doc]
  (let [doc (or doc "")]
    (if (str/starts-with? doc "Inputs: ")
      (or (second (str/split doc #"\n\n  " 2)) doc)
      doc)))

(defn- args-schema
  "The argument schema out of an `mu/defn` var's `[:=> [:cat args] out]`."
  [schema]
  (let [[_:=> [_:cat args] _out] schema]
    args))

(defn legacy-tool?
  "Whether `v` is a var carrying an old-shape tool definition."
  [v]
  (boolean (and (var? v) (:tool-name (meta v)))))

;;; ------------------------------------------------ Results -------------------------------------------------------

(defn- with-instructions
  "`output` with `instructions` appended. The old shape carried them separately and every adapter
  concatenated them; the new one has one text channel, so they are joined here."
  [output instructions]
  (cond
    (str/blank? (str instructions)) (or output "")
    (str/blank? (str output))       instructions
    :else                           (str output "\n" instructions)))

(defn- adapt-result
  "One old-shape return value as a `tools.core/result`.

  `:structured_output` is folded into `:structured-output`, `:instructions` into `:output`, and
  `:status-code` is dropped — it described the exception a tool had already caught, and a result does
  not carry one."
  [tool-name result]
  (cond
    (nil? result)   {:output ""}
    (string? result) {:output result}
    (map? result)
    (let [{:keys [output structured-output structured_output instructions data-parts resources]} result]
      (when (:terminal-error? result)
        ;; The old way to end a turn and show the user something. `:output` was the user-facing text,
        ;; which is exactly what `:user-message` is for.
        (tools.error/unrecoverable! ::terminal-error
                                    {:user-message (or (not-empty output) "Something went wrong")
                                     :data         {:tool-name tool-name}}))
      (cond-> {:output (with-instructions output instructions)}
        (or structured-output structured_output) (assoc :structured-output (or structured-output
                                                                               structured_output))
        (seq data-parts)                         (assoc :data-parts (vec data-parts))
        (seq resources)                          (assoc :resources (vec resources))))
    :else           {:output (str result)}))

(defn- adapt-throw
  "Re-raise `e` from an old-shape tool as a declared error, or rethrow it.

  `:terminal-error?` and `:agent-error?` are the two flags the old shape used to say who the message
  was for. Anything without one is a failure nobody wrote text for, so it passes through and becomes
  unrecoverable — the same judgement `with-pipeline-errors` makes."
  [tool-name ^Throwable e]
  (let [{:keys [agent-error? terminal-error?]} (ex-data e)]
    (cond
      terminal-error?
      (tools.error/unrecoverable! ::terminal-error
                                  {:user-message (or (not-empty (ex-message e)) "Something went wrong")
                                   :cause        e
                                   :data         {:tool-name tool-name}})

      agent-error?
      (tools.error/throw-recoverable! ::recoverable.legacy/agent-error
                                      {:message   (or (not-empty (ex-message e)) "The call failed.")
                                       :tool-name tool-name}
                                      {:cause e})

      :else
      (throw e))))

;;; ------------------------------------------------ The extension -------------------------------------------------

(extend-protocol tools/Tool
  clojure.lang.Var
  (declaration [this]
    (let [{:keys [tool-name doc schema scope capabilities title-fn prompt system-instructions decode]}
          (meta this)]
      (when-not tool-name
        (throw (ex-info (str this " is not a tool: its var carries no :tool-name")
                        {:var this})))
      (cond-> {:name        tool-name
               :description (description doc)
               :args        (args-schema schema)}
        scope               (assoc :scope scope)
        capabilities        (assoc :metabot/capabilities capabilities)
        title-fn            (assoc :metabot/title-fn title-fn)
        ;; Carried so nothing is lost in the adaptation. No consumer reads them, and a converted
        ;; tool declares none of them.
        prompt              (assoc :metabot/prompt prompt)
        system-instructions (assoc :metabot/system-instructions system-instructions)
        decode              (assoc :metabot/decode decode))))

  (handle [this args _ctx]
    (let [{:keys [tool-name decode]} (meta this)
          ;; `:decode` ran before the schema check in the old runtime. No tool uses it, and it is not
          ;; part of the new contract, but honouring it here keeps the adaptation faithful.
          args                       (cond-> args decode decode)]
      (try
        ;; One argument, and no ctx: the old signature. The runtime has already bound
        ;; `shared/*memory-atom*`, `*metabot-id*` and `*profile-id*` from `ctx`, which is how an
        ;; unconverted tool still reaches its state.
        (adapt-result tool-name (this args))
        (catch Throwable e
          (adapt-throw tool-name e))))))
