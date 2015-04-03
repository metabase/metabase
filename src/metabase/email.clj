(ns metabase.email
  (:require [clojure.data.json :as json]
            [clojure.tools.logging :as log]
            [clj-http.lite.client :as client]
            [medley.core :as medley]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]))

(declare api-post-messages-send
         format-recipients)

;; ## CONFIG

(defsetting mandrill-api-key "API key for Mandrill.")
(defsetting email-from-address "Email address used as the sender of system notifications.")
(defsetting email-from-name "Name used as the sender of the system notifications. (optional)")


;; ## PUBLIC INTERFACE

(defn send-message [subject recipients message-type message & {:as kwargs}]
  {:pre [(string? subject)
         (map? recipients)
         (contains? #{:text :html} message-type)
         (string? message)]}
  (medley/mapply api-post-messages-send (merge {:subject subject
                                                :to (format-recipients recipients)
                                                message-type message}
                                               kwargs)))

;; ## IMPLEMENTATION

(def ^:private api-prefix
  "URL prefix for API calls to the Mandrill API."
  "https://mandrillapp.com/api/1.0/")

(defn- api-post
  "Make a `POST` call to the Mandrill API.

    (api-post \"messages/send\" :body { ... })"
  [endpoint & {:keys [body] :as request-map
               :or {body {}}}]
  {:pre [(string? endpoint)]}
  (if-not (mandrill-api-key)
    (log/warn "Cannot send email: no Mandrill API key!")
    (let [defaults {:content-type :json
                    :accept :json}
          body (-> body
                   (assoc :key (mandrill-api-key))
                   json/write-str)]
      (client/post (str api-prefix endpoint ".json")
                   (merge defaults request-map {:body body})))))

(defn- api-post-messages-send
  "Make a `POST messages/send` call to the Mandrill API."
  [& {:as kwargs}]
  (let [defaults {:from_email (email-from-address)
                  :from_name (email-from-name)}]
    (= (:status (api-post "messages/send"
                          :body {:message (merge defaults kwargs)}))
       200)))

(defn- format-recipients
  "Format a map of email -> name in the format expected by the Mandrill API.

    (format-recipients {\"cam@metabase.com\" \"Cam Saul\"})
    -> {:email \"cam@metabase.com\"
        :name \"Cam Saul\"
        :type :to}"
  [email->name]
  (map (fn [[email name]]
         {:pre [(u/is-email? email)
                (string? name)]}
         {:email email
          :name name
          :type :to})
       email->name))
