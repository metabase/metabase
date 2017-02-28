(ns metabase.integrations.telegram
  (:require [clojure.tools.logging :as log]
            [cheshire.core :as json]
            [clj-http.client :as http]
            [metabase.models.setting :as setting, :refer [defsetting]]
            [metabase.util :as u]))


;; Define a setting which captures our Telegram api token
(defsetting telegram-token "Telegram API bearer token obtained from https://api.slack.com/web#authentication")
(defsetting telegram-channel "Telegram Channel to post into")

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

(defn post-photo!
  "Calls Telegram api `files.upload` function and returns the body of the uploaded file."
  [file text channel-ids-str]
  {:pre [file
         (instance? (Class/forName "[B") file)
         (not (zero? (count file)))
         (string? channel-ids-str)
         (seq channel-ids-str)
         (seq (telegram-token))]}
  (let [response (http/post (str telegram-api-base-url (telegram-token) "/sendPhoto")
                            {:multipart [{:name "chat_id",     :content channel-ids-str}
                                         {:name "text",        :content text}
                                         {:name "photo",       :content file}]})]
    (if (= 200 (:status response))
      (u/prog1 (get-in (:body response) [:file :url_private])
        (log/debug "Uploaded image" <>))
      (log/warn "Error uploading file to Telegram:" (u/pprint-to-str response)))))

