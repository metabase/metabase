(ns metabase.metabot.tools.legacy
  "Makes a tool written against the old shape satisfy `metabase.metabot.tools.core/Tool`.

  A tool used to be an `mu/defn` var carrying `:tool-name`, `:schema` and friends in its metadata,
  called with one argument and returning a loose result: a string, or a map with any of `:output`,
  `:structured-output`, `:structured_output`, `:instructions`, `:terminal-error?`, `:status-code`,
  `:data-parts`, `:resources`. Errors came back as a success-shaped `{:output \"…\"}` or escaped as
  an `ex-info` with `:agent-error?` or `:terminal-error?` in its ex-data.

  [[adapt]] wraps such a var in a [[LegacyTool]], which implements `Tool`. A profile's tool list goes
  through `adapt` once, so converted and unconverted tools arrive at `tools.core/entries` as the same
  kind of thing: `tools/call` calls both, and the runtime knows neither. Tools are converted one at a
  time and nothing has to happen on a single day.

  A wrapper rather than `extend-protocol` on `clojure.lang.Var`, which was the first thing tried.
  Extending the protocol to `Var` makes *every* var satisfy `Tool` — `clojure.core/map` included — so
  `satisfies? Tool` stops meaning anything and a var passed in by mistake fails somewhere inside
  `declaration` rather than where it was registered. `adapt` refuses it by name, at the call site.

  Behaviour is preserved rather than improved. An unconverted tool that returns a success-shaped
  failure still looks like a success, because nothing here can tell `{:output \"Failed to read the
  card\"}` from `{:output \"<card>…</card>\"}`. That is the thing conversion fixes, one tool at a
  time.

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
      ;; Already a declared error: raised by a converted tool this one called, or by a shared
      ;; converter such as `with-pipeline-errors`. A declared recoverable carries `:agent-error?`
      ;; too, so without this it would be re-wrapped as a legacy agent error — losing its recovery
      ;; steps and re-attributing it to this tool.
      (contains? (ex-data e) tools.error/error-key)
      (throw e)

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

;;; ------------------------------------------------ The wrapper ---------------------------------------------------

(defrecord LegacyTool [tool-var]
  tools/Tool
  (declaration [_]
    (let [{:keys [tool-name doc schema scope capabilities title-fn prompt system-instructions decode]}
          (meta tool-var)]
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

  (handle [_ args _ctx]
    (let [{:keys [tool-name decode]} (meta tool-var)
          ;; `:decode` ran before the schema check in the old runtime. No tool uses it, and it is not
          ;; part of the new contract, but honouring it here keeps the adaptation faithful.
          args                       (cond-> args decode decode)]
      (try
        ;; One argument, and no ctx: the old signature. The runtime has already bound
        ;; `shared/*memory-atom*`, `*metabot-id*` and `*profile-id*` from `ctx`, which is how an
        ;; unconverted tool still reaches its state.
        (adapt-result tool-name (tool-var args))
        (catch Throwable e
          (adapt-throw tool-name e))))))

(defn adapt
  "`tool` as something implementing `tools.core/Tool`.

  A tool that already implements the protocol is returned unchanged. A var carrying old-shape
  metadata is wrapped. Anything else is refused here, where it was registered, rather than failing
  later inside a protocol method.

  Put a profile's whole tool list through this. Each conversion then removes nothing from the call
  site — the list is uniform either way — and this call disappears when the last tool converts."
  [tool]
  (cond
    (var? tool)
    (cond
      ;; Old shape: the metadata says so, and the var itself is the handler.
      (legacy-tool? tool)                  (->LegacyTool tool)
      ;; Converted, but still named as a var — which is how profiles name every tool, so they do
      ;; not change as tools are converted one at a time.
      (satisfies? tools/Tool (deref tool)) (deref tool)
      :else
      (throw (ex-info (str tool " is not a tool: its var carries no :tool-name metadata, and its "
                           "value does not implement metabase.metabot.tools.core/Tool")
                      {:var tool})))

    (satisfies? tools/Tool tool)
    tool

    :else
    (throw (ex-info (str (pr-str tool) " is not a tool: it implements neither "
                         "metabase.metabot.tools.core/Tool nor the old var shape")
                    {:tool tool}))))

(defn adapt-all
  "Every tool in `tools` through [[adapt]], in order. What a profile's tool list goes through."
  [tools]
  (mapv adapt tools))

(defn declaration-of
  "The declaration for `tool`, converted or not.

  For code that reads a tool's name, scope or capabilities without calling it — the profile filters,
  for instance, which used to read those off the var's metadata."
  [tool]
  (tools/declaration (adapt tool)))
