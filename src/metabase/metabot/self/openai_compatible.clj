(ns metabase.metabot.self.openai-compatible
  "Adapter for any server that implements OpenAI's Chat Completions API with tool calling.

  It is vLLM's adapter under its own name and messages: the same request body, stream translation, timeouts and
  connect-time checks (see [[vllm/server]]). The connection names its model, so connecting checks that model
  whether or not the server lists it, and reads the server's `/models` only for a context window."
  (:require
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private server
  (vllm/server
   {:slug           "openai-compatible"
    :display-name   "OpenAI-compatible"
    :error-fallback #(tru "OpenAI-compatible API error (HTTP {0})" %)
    :errors         {401 #(tru "The server did not accept the API key")
                     404 #(tru "The server has no Chat Completions endpoint at this base URL, or no model with this ID")}}
   {:base-url-missing        #(tru "No base URL is set for this OpenAI-compatible connection")
    :model-missing           #(tru "No model ID is set for this OpenAI-compatible connection")
    :unreachable             #(tru "Could not reach the server at {0}. Check that it is running and that the base URL is correct." %)
    :context-too-small       #(tru "{0} has a {1} token context window, which is too small for Metabot. It needs at least {2}." %1 %2 %3)
    :reasoning-as-text       #(tru "{0} writes its reasoning into its answers, where it would show up in Metabot''s replies. Use a model or server setting that returns reasoning separately." %)
    :invalid-tool-arguments  #(tru "{0} returned a tool call whose arguments are not valid JSON. Check that the server supports tool calling for this model." %)
    :answered-with-text      #(tru "{0} answered with text instead of calling a tool. Check that the server supports tool calling for this model." %)
    :forced-call-ignored     #(tru "The server answered with text when tool_choice required a tool call. Metabot needs forced tool calls for conversation titles and SQL generation.")
    :connection-test-timeout #(tru "The server did not answer the connection test within {0}ms. A server this slow to answer a short prompt can''t run Metabot." %)
    :request-timeout         #(tru "The server did not respond within {0}ms. Check that it is not overloaded." %)
    :stopped-responding      #(tru "The server stopped responding after {0}ms. Try again, or use a faster model." %)
    :interrupted             #(tru "The connection to the server was interrupted before the response finished.")}))

(def ^:private provider (:provider server))

(defn- catalog-entry
  "The server's `/models` entry for `model`, reduced to what [[vllm/preflight!]] reads.

  The context window goes under vLLM's `max_model_len`, whether the server publishes it under that name or as
  `context_length`, as OpenRouter does. A server with no model list, or one that omits the model, publishes no
  window, and the window goes unchecked."
  [req model]
  (let [entry (try
                (->> (adapter/request! provider (assoc req :method :get :path "/models" :as :json))
                     :body
                     :data
                     (u/seek #(= model (:id %))))
                (catch Exception _
                  nil))]
    {:id            model
     :max_model_len (or (:max_model_len entry) (:context_length entry))}))

(mu/defn list-models :- adapter/ModelListing
  "List the one model the connection names.

  `:probe?` also runs [[vllm/preflight!]] against it and reports whether it reasons as `:connection-info`, for the
  connect path to store on the connection."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy? model probe?]} :- adapter/ListOpts]
   (adapter/reject-ai-proxy! provider ai-proxy?)
   (let [req {:credentials credentials :ai-proxy? ai-proxy?}]
     (cond-> {:models (if model [{:id model :display_name model}] [])}
       probe? (assoc :connection-info
                     {vllm/reasoning-config-key
                      (str (:reasoning? (vllm/preflight! server req (catalog-entry req model))))})))))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability: whether the connection's model streams its reasoning.

  A connection saved through the providers API recorded the answer when it connected (see
  [[vllm/reasoning-config-key]]). One configured by environment variables never ran that check, so it counts as
  reasoning, and the chat shows whatever reasoning arrives."
  [{:keys [credentials]} :- adapter/ResolvedRef]
  (or (vllm/reasoning-connection? credentials)
      (not (contains? credentials vllm/reasoning-config-key))))

(defn openai-compatible->aisdk-chunks-xf
  "Translate an OpenAI-compatible server's Chat Completions chunks into AI SDK v5 protocol chunks.

  The same translation as vLLM's, with reasoning tokens that a server reports next to `completion_tokens` counted
  as output."
  []
  (comp (map chat-completions/count-reasoning-as-output)
        (vllm/vllm->aisdk-chunks-xf)))

(defn openai-compatible
  "Call an OpenAI-compatible server's Chat Completions API, return AISDK stream."
  [opts]
  (eduction (openai-compatible->aisdk-chunks-xf) (chat-completions/usage-once (vllm/server-raw server opts))))
