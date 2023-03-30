(ns metabase.metabot.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as client]
   [metabase.lib.native :as lib-native]
   [metabase.metabot.util :as metabot-util]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [wkok.openai-clojure.api :as openai.api]))

(set! *warn-on-reflection* true)

(def num-choices 3)

(defsetting is-metabot-enabled
  (deferred-tru "Is Metabot enabled?")
  :type :boolean
  :visibility :authenticated
  :default true)

(defsetting openai-model
  (deferred-tru "The OpenAI Model (e.g. 'gpt-4', 'gpt-3.5-turbo')")
  :visibility :settings-manager
  :default "gpt-4")

(defsetting openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :visibility :settings-manager)

(defsetting openai-organization
  (deferred-tru "The OpenAI Organization ID.")
  :visibility :settings-manager)

(defsetting openai-sql-inference-webhook
  (deferred-tru "The Webhook URL to call the SQL inferencer. This endpoint takes a model and prompt and returns SQL.")
  :visibility :settings-manager)

(defsetting openai-model-inference-webhook
  (deferred-tru "The Webhook URL to call the model inferencer. This endpoint takes a database and prompt and returns a model.")
  :visibility :settings-manager)

(defn find-result [{:keys [choices]} message-fn]
  (some
   (fn [{:keys [message]}]
     (when-some [res (message-fn (:content message))]
       res))
   choices))

(defn ^:dynamic invoke-metabot
  "Call the bot and return the response.
  Takes messages to be used as instructions and a function that will find the first valid result from the messages."
  [messages extract-response-fn]
  (try
    (let [resp (openai.api/create-chat-completion
                {:model    (openai-model)
                 ;; Just produce a single result
                 :n        num-choices
                 ; Note - temperature of 0 is deterministic, so n > 1 will return n identical items
                 ; :temperature 0
                 :messages messages
                 ;:messages (prepare-sql-generator-input model prompt)
                 }
                {:api-key      (openai-api-key)
                 :organization (openai-organization)})]
      (tap> {:openai-response resp})
      (find-result resp extract-response-fn))
    (catch Exception e
      (throw (ex-info
              (ex-message e)
              {:exception-data (ex-data e)
               :status-code    400})))))

(defn wrap-env [handler]
  (fn [request]
    (if (and (openai-api-key)
             (openai-organization))
      (do (tap> (:body request))

          (handler (update request :body merge
                           {:openai-api-key      (openai-api-key)
                            :openai-organization (openai-organization)
                            :openai-model        (openai-model)})))
      {:status  400
       :message "OpenAI credentials are unspecified"})))

(defn wrap-json-body [handler]
  (fn [request]
    (handler (update request :body json/generate-string))))

(defn wrap-defaults [handler]
  (fn [request]
    (handler
     (into
      {:method           :post
       :throw-exceptions false
       :accept           :json
       :as               :json}
      request))))

(defn wrap-url [handler url]
  (fn [request]
    (if url
      (handler (assoc request :url url))
      {:status  400
       :message "No url specified"})))

(defn wrap-response [handler]
  (fn [request]
    (let [{:keys [body status] :as response} (handler request)]
      (if (= 200 status)
        body
        (throw
         (ex-info
          "Error invoking remote service."
          (select-keys response [:body :message])))))))

(def client (-> client/request
                wrap-json-body
                wrap-env
                wrap-defaults
                wrap-response))

(defn infer-sql [{:keys [database_id inner_query] :as model} prompt]
  (log/debugf "Using webhook to infer sql from prompt: %s" prompt)
  (let [client   (wrap-url client (openai-sql-inference-webhook))
        response (client {:body {:model model :prompt prompt}})]
    (when-some [bot-sql (:sql response)]
      (let [final-sql     (metabot-util/bot-sql->final-sql model bot-sql)
            template-tags (lib-native/template-tags inner_query)
            response      {:dataset_query          {:database database_id
                                                    :type     "native"
                                                    :native   {:query         final-sql
                                                               :template-tags template-tags}}
                           :display                :table
                           :visualization_settings {}}]
        response))))

(defn infer-model [database prompt]
  (log/debugf "Using webhook to infer model from prompt: %s" prompt)
  (let [client (wrap-url client (openai-model-inference-webhook))]
    (client
     {:body {:database database :prompt prompt}})))
