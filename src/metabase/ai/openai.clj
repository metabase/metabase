(ns metabase.ai.openai
  (:require
   [clj-http.client :as http]
   [metabase.ai.settings :as ai.settings]
   [metabase.util.json :as json]
   [metabase.util.retry :as retry]))

(def ^:private openai-url
  "https://api.openai.com/v1/chat/completions")

(def ^:private request-timeout-ms
  30000)

(defn summarize!
  "Call OpenAI's Chat Completions API and return {:markdown string :model string}.
  Throws on errors."
  [prompt]
  (let [api-key (ai.settings/ai-openai-api-key)
        model   (ai.settings/ai-openai-model)
        body    {:model       model
                 :temperature 0.2
                 :messages    [{:role    "system"
                               :content "You are a helpful data analyst. Summarize the results in clear markdown with concise insights."}
                              {:role    "user"
                               :content prompt}]}
        request {:method             :post
                 :url                openai-url
                 :headers            {"Authorization" (str "Bearer " api-key)}
                 :accept             :json
                 :content-type       :json
                 :body               (json/encode body)
                 :socket-timeout     request-timeout-ms
                 :connection-timeout request-timeout-ms
                 :throw-exceptions   false}]
    (retry/with-retry {:max-retries 1
                       :initial-interval-millis 200
                       :max-interval-millis 200}
      (let [response (http/request request)
            status   (:status response)
            payload  (some-> (:body response) json/decode+kw)
            markdown (get-in payload [:choices 0 :message :content])]
        (when-not (<= 200 status 299)
          (throw (ex-info "OpenAI request failed." {:status status})))
        (when-not (string? markdown)
          (throw (ex-info "OpenAI response missing markdown." {:status status})))
        {:markdown markdown
         :model    model}))))
