(ns metabase.metabot.self.ollama.forced-calls
  "How a forced tool call is expressed on Ollama, and read back.

  Ollama accepts `tool_choice` and discards it — the field is not in its request struct at all
  (https://docs.ollama.com/api/openai-compatibility lists it unsupported), so the forced tool call the
  shared Chat Completions builder produces is ignored (without any error). That
  makes forcing a call a subject in its own right here, rather than one flag on a request: what can be
  enforced depends on who serves the model, the request goes out differently as a result, and the
  answer comes back on a different channel and has to be moved.

  What a self-hosted server does have is `response_format`, which compiles a JSON Schema into a
  decoding grammar and the constraint holds
  against a prompt arguing otherwise. Forcing a call among several tools uses the union schema
  Ollama's own maintainers endorsed for this and mean to ship natively (ollama/ollama#6002) — an
  `anyOf` over `{name, parameters}`, one arm per tool.

  A grammar makes a tool call unavoidable, which is exactly `required` and exactly wrong for `auto`,
  so [[plan]] produces one only where the caller asked for `required`.

  None of it is available on Ollama Cloud, which serves no structured outputs (ollama/ollama#12362,
  https://docs.ollama.com/capabilities/structured-outputs) and discards `format` as silently as
  `tool_choice` — whether reached at ollama.com or through a self-hosted server that forwards a Cloud
  model there. A forced call to a Cloud model is asked for in words and nothing guarantees it."
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
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
  "What the server serving the model can actually do about a [[::mode]].

  `:grammar` is enforced by the server and cannot be talked out of. `:instruction` is a request in
  words, which a model may ignore. `:none` means neither is available — a `required` turn carrying no
  tools, which has nothing to name. It is a plan rather than a nil so that a forced request is always
  planned for: the token budget has to cover what was asked for whether or not anything can compel it."
  [:enum :grammar :instruction :none])

(mr/def ::plan
  "How a request's forced tool call will be expressed. `:schema` is present exactly when `:mechanism`
  is `:grammar`: it is the thing the decoder gets constrained by, and the other mechanisms constrain
  nothing. `:instruction` is present exactly when `:mechanism` is `:instruction`, and is the words
  that stand in for a constraint."
  [:and
   [:map {:closed true}
    [:mode        ::mode]
    [:mechanism   ::mechanism]
    [:schema      {:optional true} [:map {::mr/deliberately-open true
                                          :description "a JSON Schema the decoder is constrained by"}]]
    [:instruction {:optional true} :string]]
   [:fn {:error/message "a :schema belongs to a :grammar, and every :grammar needs one"}
    (fn [{:keys [mechanism schema]}]
      (= (= :grammar mechanism) (some? schema)))]
   [:fn {:error/message "an :instruction belongs to the :instruction mechanism, and it needs one"}
    (fn [{:keys [mechanism instruction]}]
      (= (= :instruction mechanism) (some? instruction)))]])

(mr/def ::probe-verdict
  "What a structured-output probe showed: nil when the mechanism held, or why it did not."
  [:maybe [:enum :truncated :not-honored]])

(mr/def ::choice
  "One `choices` entry of a non-streaming Chat Completions answer. Open, like every other shape a
  provider sends rather than one we compose: a build that adds a field must not fail validation for it."
  [:map {::mr/deliberately-open true
         :description "a Chat Completions choice"}
   [:finish_reason {:optional true} [:maybe :string]]
   [:message       {:optional true} [:maybe [:map {::mr/deliberately-open true
                                                   :description "a Chat Completions assistant message"}]]]])

(mr/def ::chat-completions-body
  "A Chat Completions request body. Open on purpose — this namespace reads and writes two of its keys
  and must not care about the rest."
  [:map {::mr/deliberately-open true
         :description "a Chat Completions request body"}])

(def ^:private tool-name
  "A grammar-forced answer has no tool call of its own, so [[read-back-xf]] mints one — under the name
  the shared builder would have used, so that downstream cannot tell the difference."
  chat-completions/structured-output-tool-name)

(defn cloud-instruction
  "What a Cloud forced call asks for in place of the `tool_choice` Ollama discards: a call to one of
  `tool-names`. Appended last, where an instruction carries furthest. It is not a guarantee and is not
  treated as one: a model that answers in chat anyway produces the caller's ordinary missing-tool-call
  failure.

  The tools are named rather than left to `tools` and the discarded `tool_choice`, because naming them
  is the whole of what the instruction can do — a model told only \"call a tool\" has been told less
  than the request already said."
  [tool-names]
  (str "Answer by calling "
       (if (next tool-names)
         (str "one of these tools: " (str/join ", " (map #(str "`" % "`") tool-names)))
         (str "the `" (first tool-names) "` tool"))
       ". Do not reply in chat."))

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
  "How `opts`' forced tool call will be expressed, or nil when nothing is forced — see [[::plan]] for the
  shape. `cloud?` says whether Ollama Cloud serves the requested model.

  `cloud?` is the only thing about the server this needs, and what it implies is decided here rather
  than by the caller: the adapter should not have to know that Cloud's limitation is about grammars,
  only who serves the model.

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
        cloud?                      {:mode        mode
                                     :mechanism   :instruction
                                     :instruction (cloud-instruction
                                                   (if union?
                                                     (mapv #(:name (schema/tool-function %)) tools)
                                                     [tool-name]))}
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
    :instruction (update opts :input #(conj (vec %) {:role "user" :content (:instruction plan)}))
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
        (let [buffer        (StringBuilder.)
              take!         (fn [] (let [held (str buffer)] (.setLength buffer 0) held))
              strip-content #(update-in % [:choices 0 :delta] dissoc :content)]
          (fn
            ;; a stream that ends without a finish chunk has no `stop` to vouch for the buffer, so it
            ;; is dropped for the same reason a `length` finish drops it below
            ([result]
             (rf result))
            ([result chunk]
             (let [{:keys [delta finish_reason]} (get-in chunk [:choices 0])
                   content                       (not-empty (:content delta))]
               ;; Taken before the chunk is judged, not instead of judging it: a build older than
               ;; ollama/ollama#17485 puts the last content fragment and `finish_reason` on one chunk,
               ;; so the two are not alternatives. Which build a server runs cannot be known here —
               ;; the connection check probes with a non-streaming request.
               (when content (.append buffer ^String content))
               (cond
                 finish_reason
                 ;; Only a `stop` can become a call. On anything else the buffer holds a half-written
                 ;; answer, and `:structured` would mint a call from it regardless — its name is
                 ;; fixed, so nothing stops it — which reaches the caller as
                 ;; `structured-output-invalid` rather than the truncation that actually happened.
                 (let [held (take!)
                       call (when (= "stop" finish_reason) (forced-call-chunk mode held))]
                   (if call
                     ;; the answer was a call: emit it, then the finish chunk that closes it. The
                     ;; fragment left with the buffer, so leaving it on the chunk too would put the
                     ;; grammar's raw answer on the content channel, which is what this transducer
                     ;; exists to keep it off.
                     ;;
                     ;; the call carries the message `id` and `model` because it goes first: `:start` is
                     ;; built from the first chunk that has an id, and takes the message's model from it.
                     ;; Without them the call would open before the message it belongs to, and a one-chunk
                     ;; answer would report usage without a model. Two chunks from one, so the first `rf`
                     ;; may already have ended the reduction — a client that hung up mid-stream does
                     ;; exactly that.
                     (u/reduce-preserving-reduced
                      rf result
                      [(merge call (select-keys chunk [:id :model]))
                       (-> chunk
                           strip-content
                           (assoc-in [:choices 0 :finish_reason] "tool_calls"))])
                     ;; nothing became a call, so nothing may claim one: restating `stop` as
                     ;; `tool_calls` would promise the agent loop a call and hand it none. On `stop`
                     ;; the model answered outside the grammar, and that prose is the only answer
                     ;; there is, so the whole buffer goes back on the channel it arrived on rather
                     ;; than being swallowed. On `length` the buffer is a half-written call and
                     ;; `length` is already the diagnosis, so it is dropped — stripped first, or a
                     ;; build that shares the finish chunk would show the fragment that rode in on it.
                     (rf result (cond-> (strip-content chunk)
                                  (and (= "stop" finish_reason) (seq held))
                                  (assoc-in [:choices 0 :delta :content] held)))))

                 ;; the content is held, but the chunk it came on still goes on without it: Ollama opens
                 ;; with content rather than OpenAI's empty chunk (ollama/ollama#17485), so that chunk may
                 ;; be the one carrying the message `id` the `:start` is built from
                 :else (rf result (cond-> chunk content strip-content)))))))))))

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
  "The Chat Completions body fields for a structured-output probe of a model, `cloud?` saying whether
  Ollama Cloud serves it.

  Built by running a title-shaped request through the very pipeline a real one takes, rather than by
  restating its shape: a probe that describes production by hand stops describing it the moment
  production changes, which is exactly the failure this namespace exists to fix. Streaming is dropped
  because the probe reads one whole answer, and the model is left to [[probe-chat!]]'s caller.

  So self-hosted is held to a grammar and Cloud is asked in words and offered the tool — each probed
  through the mechanism it will really use. Probing the other one proves nothing, being a path this
  model never takes."
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
   {:keys [message finish_reason]}    :- ::choice]
  (let [json-text (if cloud?
                    (get-in (first (:tool_calls message)) [:function :arguments])
                    (:content message))
        parsed    (try (json/decode+kw (str json-text)) (catch Exception _ nil))]
    (cond
      (and (map? parsed) (not-empty (str (:title parsed)))) nil
      (= "length" finish_reason)                            :truncated
      :else                                                 :not-honored)))
