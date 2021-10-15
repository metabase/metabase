(ns metabase.integrations.telegram
    (:require [clojure.tools.logging :as log]
              [cheshire.core :as json]
              [clj-http.client :as http]
              [metabase.models.setting :as setting :refer [defsetting]]
              [metabase.util.i18n :refer [deferred-tru trs tru]]
              [metabase.util.schema :as su]
              [metabase.util :as u]
              [schema.core :as s]))

;; Define a setting which captures our Telegram api token
(defsetting telegram-token (deferred-tru "Telegram bot token obtained from https://t.me/BotFather"))

(def ^:private ^:const ^String telegram-api-base-url "https://api.telegram.org/bot")

(defn telegram-configured?
  "Is Telegram integration configured?"
  []
  (boolean (seq (telegram-token))))


(defn- handle-response [{:keys [status body]}]
  (let [body (json/parse-string body keyword)]
    (if (and (= 200 status) (:ok body))
      body
      (let [error (if (= (:error_code body) 401)
                    {:errors {:telegram-token "Invalid token"}}
                    {:message (str "Telegram API error: " (:error body)), :response body})]
        (log/warn (u/pprint-to-str 'red error))
        (throw (ex-info (:message error) error))))))

(defn- do-telegram-request [request-fn params-key endpoint & {:keys [token], :as params, :or {token (telegram-token)}}]
  (when token
        (handle-response (request-fn (str telegram-api-base-url token "/" (name endpoint)) {params-key params
                                                                                            :conn-timeout   1000
                                                                                            :socket-timeout 1000}))))

(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} GET  "Make a GET request to the Telegram API."  (partial do-telegram-request http/get  :query-params))
(def ^{:arglists '([endpoint & {:as params}]), :style/indent 1} POST "Make a POST request to the Telegram API." (partial do-telegram-request http/post :form-params))

(def ^:private NonEmptyByteArray
  (s/constrained
   (Class/forName "[B")
   not-empty
   "Non-empty byte array"))

(s/defn post-photo!
  "Calls Telegram api `sendPhoto` method"
  [file :- NonEmptyByteArray, text, chat-id :- su/NonBlankString]
  {:pre [(seq (telegram-token))]}
  (let [response (http/post (str telegram-api-base-url (telegram-token) "/sendPhoto")
                            {:multipart [{:name "chat_id",     :content chat-id}
                                         {:name "caption",     :content text}
                                         {:name "parse_mode",  :content "MarkdownV2"}
                                         {:name "photo",       :content file}]})]
    (if (= 200 (:status response))
      (u/prog1 (get-in (:body response) [:file :url_private])
               (log/debug "Uploaded image" <>))
      (log/warn "Error uploading file to Telegram:" (u/pprint-to-str response)))))
