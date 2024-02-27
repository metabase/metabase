(ns metabase-enterprise.llm.client
  "A wrapper around the OpenAI client API.

  The `create-chat-completion` function combines several useful middlewares to create a client that can be used for AI
  completions. Note that this is a function that returns a function. Example usage is as follows:

  ```clojure
   ((create-chat-completion)
   {:messages [{:role \"system\" :content \"You are a helpful assistant.\"}
               {:role \"user\" :content \"Who won the world series in 2020?\"}
               {:role \"assistant\" :content \"The Los Angeles Dodgers won the World Series in 2020.\"}
               {:role \"user\" :content \"Where was it played?\"}]})
  ```

  The user need only provide a map of messages following the standard
  [OpenAI chat completions API format](https://platform.openai.com/docs/guides/text-generation/chat-completions-api).

  Note that while this is not a _de jure_ standard, it is evolving as a _de facto_ standard as can be seen by use of the
  [OpenAI Client](https://platform.openai.com/docs/libraries) with [Llama API](https://docs.llama-api.com/essentials/chat).
  "
  (:require
   [cheshire.core :as json]
   [metabase-enterprise.llm.settings :as llm-settings]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(defn- wrap-usage
  "A middleware that captures usage data and logs it for analytics and billing purposes."
  [openai-fn]
  (fn wrap-usage*
    ([params options]
     (let [{:keys [usage] :as response} (openai-fn params options)
           usage-summary (-> (dissoc response :usage :choices)
                             (merge usage)
                             (select-keys [:id :object :created :model :prompt_tokens :completion_tokens :total_tokens :system_fingerprint]))]
       (snowplow/track-event! ::snowplow/llm-usage api/*current-user-id* usage-summary)
       ;; TODO -- Remove before final PR/merge
       ;(tap> usage-summary)
       response))
    ([params] (wrap-usage* params nil))))

(defn- wrap-openai-exceptions
  "Wrap our openai calls with a standard set of exceptions that will percolate up any issues to the UI as meaningful error messages."
  [openai-fn]
  (fn wrap-openai-exceptions*
    ([params options]
     (try
       (openai-fn params options)
       (catch Exception e
         (log/warnf "Exception when calling function: %s" (.getMessage e))
         (throw
           ;; If we have ex-data, we'll assume were intercepting an openai.api/create-chat-completion response
           (if-some [status (:status (ex-data e))]
             (let [{:keys [body]} (ex-data e)
                   {:keys [error]} (json/parse-string body keyword)
                   {error-type :type :keys [message code]} error]
               (case (int status)
                 400 (do
                       (log/warnf "%s: %s" code message)
                       (ex-info
                         message
                         {:message     message
                          :status-code 400}))
                 401 (ex-info
                       "Credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                       {:message     "Credentials are incorrect or not set.\nCheck with your administrator that the correct API keys are set."
                        ;; Don't actually produce a 401 because you'll get redirect do the home page.
                        :status-code 400})
                 429 (if (= error-type "insufficient_quota")
                       (ex-info
                         "You exceeded your current OpenAI billing quota, please check your OpenAI plan and billing details."
                         {:message     "You exceeded your current OpenAI billing quota, please check your OpenAI plan and billing details."
                          :status-code status})
                       (ex-info
                         "Server is under heavy load and cannot process your request at this time.\nPlease try again."
                         {:message     "The server is under heavy load and cannot process your request at this time.\nPlease try again."
                          :status-code status}))
                 ;; Just re-throw it until we get a better handle on
                 (ex-info
                   "Error calling remote server.\nPlease try again."
                   {:message     "The server is under heavy load and cannot process your request at this time.\nPlease try again."
                    :status-code 500})))
             ;; If there's no ex-data, we'll assume it's some other issue and generate a 400
             (ex-info
               (ex-message e)
               {:exception-data (ex-data e)
                :status-code    400}))))))
    ([params] (wrap-openai-exceptions* params nil))))

(defn wrap-model-defaults
  "Add the EE default model from settings into the request"
  [openai-fn]
  (fn wrap-model-defaults*
    ([params options]
     (openai-fn
       (merge
         {:model (llm-settings/ee-openai-model)}
         params)
       options))
    ([params] (wrap-model-defaults* params nil))))

(defn wrap-ee-auth
  "Add the EE API key from settings into the request"
  [openai-fn]
  (fn wrap-ee-auth*
    ([params options]
     (openai-fn
       params
       (merge
         {:api-key (llm-settings/ee-openai-api-key)}
         options)))
    ([params]
     (wrap-ee-auth* params nil))))

(defn wrap-find-result
  "Return the first choice for which a message is present and has content."
  [openai-fn]
  (fn wrap-find-result*
    ([params options]
     (let [{:keys [choices]} (openai-fn params options)]
       (some
         (fn [{:keys [message]}] (:content message))
         choices)))
    ([params]
     (wrap-find-result* params nil))))

(defn wrap-parse-json
  "Parse a JSON result from the response. Note that this must be called after
  wrap-find-result or similar such that the response is a string."
  ([openai-fn postprocess-fn]
   (fn wrap-parse-json*
     ([params options]
      (let [response (openai-fn params options)]
        (if (string? response)
          (try
            ;; Usually you just get json back, but sometimes you get a markdown block.
            (let [md-regex #"(?s)\s*```(?:json)?(.*)```\s*"
                  response (or
                             (second (re-matches md-regex response))
                             response)]
              (postprocess-fn (json/parse-string response true)))
            (catch Exception e
              (throw
                (do
                  (log/warnf "Unparseable JSON string: %s" response)
                  (ex-info
                    (.getMessage e)
                    {:message     (.getMessage e)
                     :response    response
                     :status-code 500})))))
          (throw
            (do
              (log/warnf "Not a string: %s" response)
              (ex-info
                "Response was not a string"
                {:message     "Response was not a string"
                 :response    response
                 :status-code 500}))))))
     ([params] (wrap-parse-json* params nil))))
  ([openai-fn] (wrap-parse-json openai-fn identity)))

(defn- default-chat-completion-endpoint
  "OpenAI is the default completion endpoint"
  ([params options]
   (openai.api/create-chat-completion
     (select-keys params [:model :n :messages])
     options))
  ([params] (default-chat-completion-endpoint params nil)))

(def ^:dynamic ^{:arglists '([params options])}
  *create-chat-completion-endpoint*
  "The endpoint used to invoke the remote LLM"
  default-chat-completion-endpoint)

(defn create-chat-completion
  "Call the llm service and return the response.
  Takes messages to be used as instructions and a function that will find the
  first valid result from the messages.

  This is a function since we don't want to capture the scope of the
  *create-chat-completion-endpoint* var in the event that it needs to be rebound.

  As with all middlewares, note that preprocessing middlewares happen from the
  bottom up and postprocessing middlewares happen from the top down."
  []
  (-> *create-chat-completion-endpoint*
      wrap-ee-auth
      wrap-model-defaults
      wrap-openai-exceptions
      wrap-usage
      wrap-find-result))
