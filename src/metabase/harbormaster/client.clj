(ns metabase.harbormaster.client
  "API client for interfacing with Harbormaster on store-api-url."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- +slash-prefix [s]
  (cond->> s
    (not (str/starts-with? s "/")) (str "/")))

(mu/defn- ->requestor [method]
  (case method
    :get     http/get
    :head    http/head
    :post    http/post
    :put     http/put
    :delete  http/delete
    :options http/options
    :copy    http/copy
    :move    http/move
    :patch   http/patch))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; PUBLIC API:
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mu/defn make-request :- [:tuple [:enum :ok :error] :map]
  "Makes a request to the store-api-url with the given method, path, and body.

  Returns a tuple of [:ok response] if the request was successful, or [:error response] if it failed."
  [config :- [:map [:store-api-url :string] [:api-key :string]]
   method :- [:enum :get :head :post :put :delete :options :copy :move :patch]
   url :- :string
   & [body]]
  (let [{:keys [store-api-url
                api-key]} config
        request           (cond-> {:headers {"Authorization" (str "Bearer " api-key)
                                             "Content-Type" "application/json"}}
                            body (assoc :body (json/encode body)))
        unparsed-response (try
                            (-> (str store-api-url (+slash-prefix #p url))
                                ((->requestor method) request))
                            (catch Exception e
                              (log/errorf e "Error making request to %s" url)
                              {:ex-data (ex-data e)
                               :request request
                               :url url}))
        response          (try
                            (m/update-existing unparsed-response :body json/decode+kw)
                            (catch Exception e
                              (log/errorf e "Error decoding response from %s, is it json?" url)
                              {:ex-data (ex-data e)
                               :unparsed-response unparsed-response
                               :request request
                               :url url}))]
    [(if (and response (http/success? response)) :ok :error)
     response]))
