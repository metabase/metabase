(ns metabase.metabot.self.claude
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (metabase.metabot.providers.anthropic MessagesTranslator)))

(set! *warn-on-reflection* true)

(def ^:private default-model "claude-haiku-4-5")

(def ^:private anthropic-version "2023-06-01")

(def ^:private fast-mode-beta
  "The beta header opting a request into Anthropic fast mode."
  "fast-mode-2026-02-01")

(defn claude->aisdk-chunks-xf
  "Translates Claude /v1/messages streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   The translation itself is [[MessagesTranslator]]."
  []
  (core/translator-xf #(MessagesTranslator. core/mkid core/log-malformed-event)))

;;; AISDK parts → Claude messages

(defn- ->content-blocks
  "Coerce content into a sequence of Claude content blocks."
  [content]
  (cond
    (and (string? content) (str/blank? content)) []
    (string? content) [{:type "text" :text content}]
    :else content))

(defn- merge-consecutive
  "Merge consecutive assistant messages into a single message with combined content.
  Claude API doesn't allow consecutive messages with the same role."
  [messages]
  (into [] (comp (partition-by :role)
                 (mapcat (fn [group]
                           [{:role    (:role (first group))
                             :content (into [] (mapcat (comp ->content-blocks :content)) group)}])))
        messages))

(defn parts->claude-messages
  "Convert a sequence of AISDK parts into Claude API messages.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :reasoning, :text \"...\", :provider-metadata {...}}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :result ...}

  Reasoning becomes `thinking`/`redacted_thinking` blocks — Claude 400s unless they
  are echoed back verbatim (signed) ahead of the tool_use they preceded. Unsigned
  reasoning (foreign parts, interrupted blocks) is dropped."
  [parts]
  (->> parts
       ;; a signed thinking block must be echoed back as ONE block or Claude 400s
       core/merge-reasoning-parts
       (into []
             (keep (fn [part]
                     (case (:type part)
                       :reasoning   (let [pm       (:provider-metadata part)
                                          redacted (get-in pm [:anthropic :redactedData])
                                          sig      (get-in pm [:anthropic :signature])]
                                      (cond
                                        redacted {:role    "assistant"
                                                  :content [{:type "redacted_thinking" :data redacted}]}
                                        sig      {:role    "assistant"
                                                  :content [{:type      "thinking"
                                                             :thinking  (:text part)
                                                             :signature sig}]}
                                        :else    nil))
                       :text        {:role    "assistant"
                                     :content (:text part)}
                       :tool-input  {:role    "assistant"
                                     :content [{:type  "tool_use"
                                                :id    (:id part)
                                                :name  (:function part)
                                                :input (or (:arguments part) {})}]}
                       :tool-output {:role    "user"
                                     :content [{:type        "tool_result"
                                                :tool_use_id (:id part)
                                                :content     (or (get-in part [:result :output])
                                                                 (when-let [err (:error part)]
                                                                   (str "Error: " (:message err)))
                                                                 (pr-str (:result part)))}]}
                       ;; User messages pass through
                       {:role    (name (or (:role part) "user"))
                        :content (:content part)}))))
       merge-consecutive
       vec))

;;; Tool definition format

(defn- tool->claude
  "Convert a tool definition map to Claude API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [tool]
  (let [{:keys [name description parameters]} (schema/tool-function tool)]
    {:name         (or name "unknown")
     :description  description
     :input_schema parameters}))

(defn- add-tools-cache-breakpoint
  "Attach an ephemeral cache_control marker to the last tool in `tools`.
  Anthropic caches everything in the request up to and including the block with
  `cache_control`, so a single breakpoint on the final tool covers the whole
  tool list."
  [tools]
  (if (seq tools)
    (update tools (dec (count tools)) assoc :cache_control {:type "ephemeral"})
    tools))

(def ^:private system-cache-breakpoint-sentinel
  "Literal marker placed in selmer templates to indicate where the static cacheable
  prefix ends and the dynamic per-request suffix begins. Anthropic-only; ignored
  by other provider adapters."
  "<<<METABOT_CACHE_BREAKPOINT>>>")

(defn system->cached-content-blocks
  "Wrap a rendered system prompt for Anthropic, applying ephemeral cache_control.

  If `system` contains the cache breakpoint sentinel, split it into two content
  blocks: a cached static prefix and an uncached dynamic suffix. The model sees
  the concatenation; the split is purely a wire-protocol device for caching.

  If the sentinel is absent (or nothing but whitespace follows it) fall back to
  a single cached content block covering the whole prompt."
  [system]
  (let [idx    (.indexOf ^String system ^String system-cache-breakpoint-sentinel)
        suffix (when-not (neg? idx)
                 (str/triml (subs system (+ idx (count system-cache-breakpoint-sentinel)))))]
    (if (or (neg? idx) (str/blank? suffix))
      [{:type          "text"
        :text          (if (neg? idx) system (str/trimr (subs system 0 idx)))
        :cache_control {:type "ephemeral"}}]
      [{:type          "text"
        :text          (str/trimr (subs system 0 idx))
        :cache_control {:type "ephemeral"}}
       {:type "text"
        :text suffix}])))

(defn- anthropic-auth
  "Anthropic's `:auth`. Identical to [[adapter/bearer-auth]] except that the key travels bare in
  `x-api-key` rather than as a bearer token."
  [{:keys [slug display-name]} {:keys [credentials ai-proxy?]}]
  (core/resolve-auth slug display-name
                     (when-let [k (not-empty (:api-key credentials))]
                       {:url     (:base-url credentials)
                        :headers {"x-api-key" k}})
                     ai-proxy?))

(def ^:private provider
  "Anthropic is the one provider the Metabase Cloud AI proxy can serve, so `:supports-ai-proxy?` is true
  here and a proxied request goes through rather than being rejected."
  (adapter/provider
   {:slug               "anthropic"
    :display-name       "Anthropic"
    :supports-ai-proxy? true
    :auth               anthropic-auth
    :headers            {"anthropic-version" anthropic-version}
    :error-fallback     #(tru "Anthropic API error (HTTP {0})" %)
    :errors             {401 #(tru "Anthropic API key expired or invalid")
                         403 #(tru "Anthropic API key has insufficient permissions")
                         404 #(tru "Anthropic API endpoint is unavailable or the model was not found")
                         413 #(tru "Anthropic API rejected our request because it was too large")
                         429 #(tru "Anthropic API has rate limited us")
                         500 #(tru "Anthropic API is not working but not saying why")
                         529 #(tru "Anthropic API is overloaded and is asking us to wait")}}))

(def supported-models
  "Anthropic chat models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"claude-fable-5"             {:display-name "Claude Fable 5"    :max-tokens 128000 :context-window 1000000}
   "claude-opus-5"              {:display-name "Claude Opus 5"     :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-8"            {:display-name "Claude Opus 4.8"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-7"            {:display-name "Claude Opus 4.7"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-6"            {:display-name "Claude Opus 4.6"   :max-tokens 128000 :context-window 1000000}
   "claude-opus-4-5-20251101"   {:display-name "Claude Opus 4.5"   :max-tokens  64000 :context-window  200000}
   "claude-opus-4-1-20250805"   {:display-name "Claude Opus 4.1"   :max-tokens  32000 :context-window  200000}
   "claude-sonnet-5"            {:display-name "Claude Sonnet 5"   :max-tokens 128000 :context-window 1000000}
   "claude-sonnet-4-6"          {:display-name "Claude Sonnet 4.6" :max-tokens 128000 :context-window 1000000}
   "claude-sonnet-4-5-20250929" {:display-name "Claude Sonnet 4.5" :max-tokens  64000 :context-window  200000}
   "claude-haiku-4-5-20251001"  {:display-name "Claude Haiku 4.5"  :max-tokens  64000 :context-window  200000}})

(def ^:private default-max-tokens
  "`max_tokens` for an unresolved model — low enough to be safe on any of them."
  64000)

(mu/defn list-models :- adapter/ModelListing
  "List the Anthropic chat models supported by this adapter, by intersecting [[supported-models]] with the
  account's `/v1/models` catalog.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing. Also supports `:ai-proxy?`."
  ([] (list-models {}))
  ([opts :- adapter/ListOpts]
   (adapter/model-listing supported-models
                          (adapter/fetch-catalog provider opts "/v1/models")
                          :display_name)))

(defn- strip-vendor-prefix
  "`model` lowercased and without an optional vendor prefix (e.g. Bedrock's `anthropic.`).

  Lowercasing lets the model-derived predicates hold for Azure's admin-cased deployment names."
  [model]
  (str/replace-first (u/lower-case-en (str model)) #"^anthropic\." ""))

(defn- model-max-tokens
  "The `max_tokens` ceiling for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [(strip-vendor-prefix model) :max-tokens]))

(mu/defn context-window-tokens :- [:maybe :int]
  "The input context window for `model`, or nil when it isn't one we know."
  [model :- [:maybe :string]]
  (get-in supported-models [(strip-vendor-prefix model) :context-window]))

(defn- claude-model-version
  "`[family major minor]` for a Claude opus/sonnet model id, or nil."
  [model]
  ;; the minor version accepts both separators: canonical ids are hyphenated (claude-opus-4-8)
  ;; but Azure admins name deployments freely, and the dotted display-name spelling
  ;; (claude-opus-4.8) is the norm for the GPT family next to it
  (when-let [[_ family major minor] (re-find #"^claude-(opus|sonnet)-(\d+)(?:[-.](\d+))?"
                                             (strip-vendor-prefix model))]
    [family (parse-long major) (or (some-> minor parse-long) 0)]))

(defn- model-current-gen?
  "Current-generation Claude (Fable, Opus >=4.7, Sonnet >=5): no sampling params;
  thinking streams via `display: summarized`."
  [model]
  (or (str/starts-with? (strip-vendor-prefix model) "claude-fable")
      (when-let [[family major minor] (claude-model-version model)]
        (case family
          "opus"   (or (> major 4) (and (= major 4) (>= minor 7)))
          "sonnet" (>= major 5)))))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter. Sampling params
  were removed starting with Claude Opus 4.7 and Sonnet 5."
  [model]
  (not (model-current-gen? model)))

(defn- model-thinking-config
  "Thinking config that streams reasoning for `model`, or nil where we don't enable
  it (older budget-token models — off in v1)."
  [model]
  (let [[_ major minor] (claude-model-version model)]
    (cond
      (model-current-gen? model)          {:type "adaptive" :display "summarized"}
      (and major (= major 4) (= minor 6)) {:type "adaptive" :display "summarized"})))

(defn reasoning-model?
  "Whether `model` streams reasoning back to us."
  [model]
  (some? (model-thinking-config model)))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. Anthropic answers from the model name: thinking is requested in the request body."
  [{:keys [model]} :- adapter/ResolvedRef]
  (reasoning-model? model))

(def ^:private fast-mode-models
  "The models Anthropic documents fast mode for: https://code.claude.com/docs/en/fast-mode"
  #{"claude-opus-4-8" "claude-opus-5"})

(defn fast-mode-model?
  "Whether `model` supports Anthropic fast mode. Never through the AI proxy: fast mode is premium-priced,
  and proxied requests bill through Metabase Cloud rather than the instance's own key."
  [model ai-proxy?]
  (and (not ai-proxy?)
       (contains? fast-mode-models (strip-vendor-prefix model))))

(mu/defn supports-fast-mode? :- :boolean
  "Registry capability. Fast mode depends on the model and on whether the call is proxied."
  [{:keys [model ai-proxy?]} :- adapter/ResolvedRef]
  (fast-mode-model? model ai-proxy?))

(mu/defn claude-request-body
  "Build the Anthropic Messages API request body for an LLM request.

  A caller-supplied `:reasoning-config` is this dialect's `thinking` block and wins outright: an
  adapter re-hosting a non-Claude model here knows its own provider's thinking shape and
  restrictions, which the model-id-derived config and the suppression rules below cannot describe."
  [{:keys [model system input tools schema tool_choice temperature max-tokens reasoning? reasoning-config fast? ai-proxy?]
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  (let [;; forced tool choice (structured output, or "required") is incompatible
        ;; with thinking — suppress it there.
        thinking  (or reasoning-config
                      (when-not (or (not reasoning?) schema (= "required" (some-> tool_choice name)))
                        (model-thinking-config model)))
        fast?     (and fast? (fast-mode-model? model ai-proxy?))
        input     (cond->> input
                    (nil? thinking) (remove #(= :reasoning (:type %))))
        messages  (parts->claude-messages input)
        all-tools (when (seq tools) (mapv tool->claude tools))
        all-tools (if (and all-tools (not schema))
                    (add-tools-cache-breakpoint all-tools)
                    all-tools)]
    (cond-> {:model         model
             :max_tokens    (or max-tokens (model-max-tokens model) default-max-tokens)
             :stream        true
             :cache_control {:type "ephemeral"}
             :messages      messages}
      system            (assoc :system (system->cached-content-blocks system))
      all-tools         (assoc :tools all-tools)
      schema            (assoc :tool_choice {:type "tool"
                                             :name "structured_output"}
                               :tools [{:name         "structured_output"
                                        :description  "Output structured data"
                                        :input_schema schema}])

      (and all-tools tool_choice)
      (assoc :tool_choice (case (name tool_choice)
                            "auto"     {:type "auto"}
                            "required" {:type "any"}))

      thinking          (assoc :thinking thinking)

      fast?             (assoc :speed "fast")

      ;; sampling params are rejected alongside thinking
      (and temperature (not thinking) (model-supports-temperature? model))
      (assoc :temperature temperature))))

(defn- fast-mode-rejection?
  "Whether a decoded 400 reads as Anthropic rejecting fast mode itself (account not in the
  research preview, beta header not recognized) rather than some unrelated malformed request."
  [res]
  (boolean (re-find #"(?i)fast[ _-]?mode|\bspeed\b"
                    (str (get-in res [:body :error :message])))))

(def ^:private fast-mode-cooldown-ms
  "How long to stop requesting fast mode after Anthropic rejects a fast-mode request.
  Fast and standard speed don't share prompt-cache prefixes, so flapping between them
  rewrites the conversation cache on every flip; holding standard for a window keeps
  the speed (and the cache) stable, and spares doomed fast attempts while the account
  is over its fast-mode limits or not enrolled at all."
  (* 5 60 1000))

(def ^:private fast-mode-cooldown-until
  "Epoch millis until which fast mode is skipped. Process-local, resets on restart."
  (atom 0))

(defn- fast-mode-cooling-down?
  []
  (< (System/currentTimeMillis) @fast-mode-cooldown-until))

(defn- fast-mode-retry-or-throw!
  "The `:on-request-error` handler for [[claude-raw]]. Retries the request at standard speed when Anthropic
  rejected fast mode itself, and otherwise rethrows through the usual translation.

  Decoding the error body also closes the streamed response, so the connection is not leaked when the
  exception is swallowed by the retry. Fast mode has its own rate-limit pool, so a 429 here doesn't
  imply standard speed is limited; a 400 needs its message checked to keep unrelated malformed requests
  failing fast. A 529 means the API itself is overloaded, so it gets no immediate retry: surface it and
  let the caller's retry loop pace the next attempt, which the armed cooldown keeps at standard speed."
  [req retry! ^Throwable e]
  (let [status    (:status (ex-data e))
        res       (when (and (:speed req) (contains? #{400 429 529} status))
                    (core/decode-error-body e))
        rejected? (and res (or (not= 400 status) (fast-mode-rejection? res)))]
    (when rejected?
      (reset! fast-mode-cooldown-until (+ (System/currentTimeMillis) fast-mode-cooldown-ms))
      (log/warn "Anthropic rejected the fast-mode request; falling back to standard speed" {:status status}))
    (if (and rejected? (not= 529 status))
      (retry!)
      (adapter/rethrow! provider (if res (ex-info (str (ex-message e)) res e) e)))))

(mu/defn claude-raw
  "Perform a streaming request to Claude API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (cond-> (assoc opts :model model)
               (fast-mode-cooling-down?) (assoc :fast? false))
        req  (claude-request-body opts)]
    (adapter/stream! provider opts
                     {:path             "/v1/messages"
                      :body             req
                      :headers          (when (:speed req) {"anthropic-beta" fast-mode-beta})
                      :on-request-error #(fast-mode-retry-or-throw!
                                          req
                                          (fn [] (claude-raw (assoc opts :fast? false)))
                                          %)})))

(defn claude
  "Call Claude API, return AISDK stream"
  [& args]
  (let [raw (apply claude-raw args)]
    (eduction (claude->aisdk-chunks-xf) raw)))

(comment
  ;; Now just use standard `into` - no core.async needed!
  (def q (into [] (claude-raw {:input [{:role "user" :content "How are you feeling today?"}]})))

  (into [] (comp (claude->aisdk-chunks-xf) core/aisdk-xf) q))
