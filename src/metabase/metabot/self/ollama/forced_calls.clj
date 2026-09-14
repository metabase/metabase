(ns metabase.metabot.self.ollama.forced-calls
  "How a forced tool call is expressed on Ollama, and read back.

  Ollama accepts `tool_choice` and discards it — the field is not in its request struct at all
  (https://docs.ollama.com/api/openai-compatibility lists it unsupported), so the forced tool call the
  shared Chat Completions builder produces is ignored (without any error). That
  makes forcing a call a subject in its own right here, rather than one flag on a request: what can be
  enforced depends on the deployment, the request goes out differently as a result, and the answer
  comes back on a different channel and has to be moved.

  What a self-hosted server does have is `response_format`, which compiles a JSON Schema into a
  decoding grammar and the constraint holds
  against a prompt arguing otherwise. Forcing a call among several tools uses the union schema
  Ollama's own maintainers endorsed for this and mean to ship natively (ollama/ollama#6002) — an
  `anyOf` over `{name, parameters}`, one arm per tool.

  A grammar makes a tool call unavoidable, which is exactly `required` and exactly wrong for `auto`,
  so [[plan]] produces one only where the caller asked for `required`.

  None of it is available on Ollama Cloud, which serves no structured outputs (ollama/ollama#12362,
  https://docs.ollama.com/capabilities/structured-outputs) and discards `format` as silently as
  `tool_choice`. There a forced call is asked for in words and nothing guarantees it."
  (:require
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.schema :as schema]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Contracts ------------------------------------------------

(mr/def ::mode
  "What kind of forced call a request asks for.

  `:structured` is one known shape, from `:schema` — the caller wants data rather than prose.
  `:tool-union` is a call among the caller's own tools, from `tool_choice: required`."
  [:enum :structured :tool-union])

(mr/def ::mechanism
  "What this deployment can actually do about a [[::mode]].

  `:grammar` is enforced by the server and cannot be talked out of. `:instruction` is a request in
  words, which a model may ignore. `:none` means neither is available — on Cloud, which can do
  neither, and for a `required` turn carrying no tools. It is a plan rather than a nil so that a
  forced request is always planned for: the token budget has to cover what was asked for whether or
  not anything can compel it."
  [:enum :grammar :instruction :none])

(mr/def ::plan
  "How a request's forced tool call will be expressed. `:schema` is present exactly when `:mechanism`
  is `:grammar`: it is the thing the decoder gets constrained by, and the other mechanisms constrain
  nothing."
  [:and
   [:map
    [:mode      ::mode]
    [:mechanism ::mechanism]
    [:schema    {:optional true} :map]]
   [:fn {:error/message "a :schema belongs to a :grammar, and every :grammar needs one"}
    (fn [{:keys [mechanism schema]}]
      (= (= :grammar mechanism) (some? schema)))]])

(mr/def ::probe-verdict
  "What a structured-output probe showed: nil when the mechanism held, or why it did not."
  [:maybe [:enum :truncated :not-honored]])

(mr/def ::chat-completions-body
  "A Chat Completions request body. Open on purpose — this namespace reads and writes two of its keys
  and must not care about the rest."
  :map)

(def ^:private tool-name
  "A grammar-forced answer has no tool call of its own, so [[read-back-xf]] mints one — under the name
  the shared builder would have used, so that downstream cannot tell the difference."
  chat-completions/structured-output-tool-name)

(def cloud-instruction
  "What a Cloud forced call asks for in place of the `tool_choice` Ollama discards. Appended last,
  where an instruction carries furthest. It is not a guarantee and is not treated as one: a model that
  answers in chat anyway produces the caller's ordinary missing-tool-call failure."
  "Answer by calling the `structured_output` tool. Do not reply in chat.")

;;; ------------------------------------------------- The decision -----------------------------------------------

(defn- response-format
  "The `response_format` that puts Ollama's decoder under `schema`. Ollama reads only the inner
  `:schema`; `:name` is sent to keep the body the shape every other OpenAI-compatible server expects."
  [schema]
  {:type        "json_schema"
   :json_schema {:name   tool-name
                 :schema schema}})

(defn- tool-union-schema
  "A schema satisfied only by a call to one of `tools`, which are [[core/LLMRequestOpts]] tool entries.

  One `anyOf` arm per tool, each pinning `name` to that tool with a single-value `enum` and taking its
  own parameter schema. The model can satisfy the grammar only by naming a tool and supplying
  arguments that fit it, which is the guarantee `tool_choice: required` was supposed to give."
  [tools]
  {:anyOf (mapv (fn [tool]
                  (let [{:keys [name parameters]} (schema/tool-function tool)]
                    {:type       "object"
                     :properties {:name       {:type "string" :enum [name]}
                                  :parameters parameters}
                     :required   ["name" "parameters"]}))
                tools)})

(mu/defn plan :- [:maybe ::plan]
  "How `opts`' forced tool call will be expressed on a `cloud?` deployment, or nil when nothing is
  forced — see [[::plan]] for the shape.

  `cloud?` is the only thing about the deployment this needs, and what it implies is decided here
  rather than by the caller: the adapter should not have to know that Cloud's limitation is about
  grammars, only which server it is talking to.

  A plan is produced for every forced request, even where nothing can be done about it, so that
  callers have one question to ask rather than two: `(some? (plan opts cloud?))` answers whether a
  tool call was asked for, and `:mechanism` answers what came of it.

  `auto` yields nil: a grammar would silently promote it to `required`."
  [{:keys [schema tools tool_choice]} :- core/LLMRequestOpts
   cloud?                             :- :boolean]
  (when-let [mode (cond
                    (some? schema)                          :structured
                    (= "required" (some-> tool_choice name)) :tool-union)]
    (let [union? (= :tool-union mode)]
      (cond
        ;; nothing to choose among: no mechanism can compel a call that has no tool to make, and a
        ;; union grammar over no tools would be a constraint nothing could satisfy
        (and union? (empty? tools)) {:mode mode :mechanism :none}
        cloud?                      {:mode mode :mechanism (if union? :none :instruction)}
        :else                       {:mode      mode
                                     :mechanism :grammar
                                     :schema    (if union? (tool-union-schema tools) schema)}))))

;;; --------------------------------------------- Shaping the request --------------------------------------------

(mu/defn opts-for
  "`opts` adjusted for `plan`, before the shared Chat Completions builder sees them. A nil plan changes
  nothing, so an unforced request passes through untouched."
  [plan :- [:maybe ::plan]
   opts :- core/LLMRequestOpts]
  (case (:mechanism plan)
    ;; the shared builder mints a tool and a `tool_choice` from `:schema`; under a grammar that already
    ;; carries the shape there is nothing for the model to call. `:tools` goes with it to preserve the
    ;; builder's own rule — `chat-completions/request-body` drops real tools whenever `:schema` is set
    ;; (its `all-tools` binding), so leaving them here would hand the model tools this request never had
    :grammar     (cond-> opts (= :structured (:mode plan)) (dissoc :schema :tools))
    :instruction (update opts :input #(conj (vec %) {:role "user" :content cloud-instruction}))
    opts))

(mu/defn body-for :- ::chat-completions-body
  "The built Chat Completions `body` adjusted for `plan`. A nil plan changes nothing."
  [plan :- [:maybe ::plan]
   body :- ::chat-completions-body]
  (if (= :grammar (:mechanism plan))
    ;; the builder defaults `tool_choice` to "auto" whenever tools are present. Ollama discards it
    ;; either way, but a body that says "auto" while being grammar-forced reads as the opposite of what
    ;; it does — and this body is what lands in the debug capture. Cloud keeps its `tool_choice`, where
    ;; it states the real intent and is the one thing that would make Cloud work on its own the day
    ;; Ollama implements the field.
    (-> body
        (assoc :response_format (response-format (:schema plan)))
        (dissoc :tool_choice))
    body))

;;; ---------------------------------------------- Reading it back -----------------------------------------------

(defn- forced-call-chunk
  "The Chat Completions chunk that carries `content` back as a tool call, or nil when it cannot be read
  as one.

  `:structured` knows the name up front and the whole answer is the arguments. `:tool-union` has to
  read the name out of the answer, so a truncated one yields nil: emitting no call lets the `length`
  finish reason stand as the diagnosis, which is the true one."
  [mode content]
  (let [[name arguments]
        (case mode
          :structured [tool-name content]
          :tool-union (let [parsed (try (json/decode+kw content) (catch Exception _ nil))]
                        (when-let [called (and (map? parsed) (not-empty (str (:name parsed))))]
                          [called (json/encode (or (:parameters parsed) {}))])))]
    (when name
      {:choices [{:index 0
                  :delta {:tool_calls [{:id       (core/mkid)
                                        :type     "function"
                                        :function {:name name :arguments arguments}}]}}]})))

(mu/defn read-back-xf :- [:maybe fn?]
  "A transducer over Chat Completions chunks putting a grammar-forced answer back on the tool-call
  channel, or nil when `plan` needs none.

  Under a grammar the answer arrives in the content channel — `message.content`, not `tool_calls` —
  because the grammar constrains decoding rather than driving the template's tool path. Both the
  `call-llm-structured` consumers and the agent loop read tool calls, so the difference is undone
  here, ahead of the shared translation: downstream sees exactly the stream a provider with a working
  `tool_choice` produces.

  Content is held rather than forwarded, because `:tool-union` cannot name the tool until it has read
  the answer. Nothing is lost by waiting: a forced call is not a message being shown to anyone as it
  arrives.

  Reasoning deltas ride through untouched. The grammar binds the answer channel only, so a thinking
  model still streams its thinking beside it."
  [plan :- [:maybe ::plan]]
  (when (= :grammar (:mechanism plan))
    (let [mode (:mode plan)]
      (fn [rf]
        (let [buffer (StringBuilder.)
              flush! (fn [result]
                       (let [chunk (forced-call-chunk mode (str buffer))]
                         (.setLength buffer 0)
                         (if chunk (rf result chunk) result)))]
          (fn
            ([result]
             (rf (cond-> result (pos? (.length buffer)) (flush!))))
            ([result chunk]
             (let [{:keys [delta finish_reason]} (get-in chunk [:choices 0])
                   content                       (not-empty (:content delta))]
               (cond
                 content (do (.append buffer ^String content) result)

                 ;; the answer is complete: flush the call, then the finish chunk that closes it.
                 ;; `length` stands as it is — truncation has to stay visible, and dressing it up as a
                 ;; completed call would hide it behind a JSON parse error
                 finish_reason (-> result
                                   (flush!)
                                   (rf (cond-> chunk
                                         (= "stop" finish_reason)
                                         (assoc-in [:choices 0 :finish_reason] "tool_calls"))))

                 :else (rf result chunk))))))))))

;;; ------------------------------------------------- Preflight --------------------------------------------------

(def ^:private probe-schema
  "A title-shaped schema for the structured-output probe. Deliberately the shape conversation titling
  actually sends: a probe on a schema no caller uses could pass on a model that fails the real thing."
  {:type                 "object"
   :properties           {:title {:type        "string"
                                  :description "A short title for the conversation."}}
   :required             ["title"]
   :additionalProperties false})

(def ^:private probe-messages
  [{:role "user" :content "Give this conversation a short title. The user asked which orders shipped late."}])

(mu/defn probe-body :- ::chat-completions-body
  "The Chat Completions body fields for a structured-output probe on this deployment.

  Built by running a title-shaped request through the very pipeline a real one takes, rather than by
  restating its shape: a probe that describes production by hand stops describing it the moment
  production changes, which is exactly the failure this namespace exists to fix. Streaming is dropped
  because the probe reads one whole answer, and the model is left to [[probe-chat!]]'s caller.

  So self-hosted is held to a grammar and Cloud is asked in words and offered the tool — each probed
  through the mechanism it will really use. Probing the other one would test a path this connection
  never takes, which is how the check this replaced came to prove nothing, being a second
  `tool_choice` the server discarded."
  [cloud? :- :boolean]
  (let [opts {:input probe-messages :schema probe-schema}
        plan (plan opts cloud?)]
    (-> (body-for plan (chat-completions/request-body (opts-for plan opts)))
        (dissoc :model :stream :stream_options))))

(mu/defn probe-verdict :- ::probe-verdict
  "What a [[probe-body]] answer shows: nil when the mechanism held, `:truncated` when the answer was cut
  off before it could, `:not-honored` when it simply was not.

  Parsing is the check, not the presence of a reply: a schema honored in form but not in content is
  still unusable by the callers this protects."
  [cloud?                             :- :boolean
   {:keys [message finish_reason]}    :- [:map [:message {:optional true} [:maybe :map]]]]
  (let [json-text (if cloud?
                    (get-in (first (:tool_calls message)) [:function :arguments])
                    (:content message))
        parsed    (try (json/decode+kw (str json-text)) (catch Exception _ nil))]
    (cond
      (and (map? parsed) (not-empty (str (:title parsed)))) nil
      (= "length" finish_reason)                            :truncated
      :else                                                 :not-honored)))
