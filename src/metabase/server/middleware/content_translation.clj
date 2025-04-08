(ns metabase.server.middleware.content-translation
  "Middleware related to adding translations of user-generated content."
  (:require
   [metabase.util.json :as json]
  ))

(defn add-translations
  "Middleware to add translations of certain user-generated strings"
  [handler]
  (fn [request respond raise]
    (handler
     request
     (fn [response]
       ;; Check if the response has a JSON content type
       (if (= (get-in response [:headers "Content-Type"]) "application/json")
         (let [current-body   (some-> response :body json/decode :key-fn keyword)
               modified-body  (assoc current-body :wallace "grommit")
               new-json-body  (json/generate modified-body)]
           (respond (assoc response :body new-json-body)))
         (respond response)))
     raise)))
