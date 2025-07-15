(ns metabase-enterprise.harbormaster.client
  "API client for interfacing with Harbormaster on store-api-url."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [martian.clj-http :as martian-http]
   [martian.core :as martian]
   [medley.core :as m]
   [metabase.api.settings :as api.auth]
   [metabase.cloud-migration.core :as cloud-migration]
   [metabase.util :as m.util]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

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

(mu/defn- get-safe-status
  [response]
  (when (number? (:status response))
    (http/success? response)))

(defn- ->config
  "Returns the config needed to call [[make-request]].

  `->config` either gets the store-api-url and api-key from settings or throws an exception when either are unset or
  blank."
  []
  (let [store-api-url (cloud-migration/store-api-url)
        _ (when (str/blank? store-api-url)
            (log/error "Missing store-api-url. Cannot create hm client config.")
            (throw (ex-info (tru "Missing store-api-url.") {:store-api-url store-api-url})))
        api-key (api.auth/api-key)
        _ (when (str/blank? api-key)
            (log/error "Missing api-key. Cannot create hm client config.")
            (throw (ex-info (tru "Missing api-key.") {:api-key api-key})))]
    {:store-api-url store-api-url
     :api-key api-key}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; PUBLIC API:
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(mr/def :hm-client/http-reply [:tuple [:enum :ok :error] :map])

(defn- send-request [request-method-fn store-api-url url request]
  (let [response (try
                   (request-method-fn
                    (str store-api-url (+slash-prefix url))
                    request)
                   (catch Exception e
                     (log/errorf e "Error making request to %s" url)
                     {:ex-data (ex-data e)
                      :request request
                      :url     url}))]
    (log/info "Harbormaster API call:"
              {:method   (m.util/upper-case-en (last (str/split (-> request-method-fn class .getSimpleName) #"\$")))
               :url      url
               :request-body  (:body request)
               :response (select-keys response [:status :body])})
    response))

(defn- decode-response [unparsed-response url request]
  (if (some? (:ex-data unparsed-response)) ;; skip decoding failed responses
    unparsed-response
    (try
      (m/update-existing unparsed-response :body json/decode+kw)
      (catch Exception e
        (log/errorf e "Error decoding response from %s, is it json?" url)
        {:ex-data           (ex-data e)
         :unparsed-response unparsed-response
         :request           request
         :url               url}))))

(defn- calculate-success [response url request]
  (try
    (get-safe-status response)
    (catch Exception e
      (log/errorf e "Error decoding response from %s, is it json?" url)
      {:response response
       :request  request
       :url      url
       :ex-data  (ex-data e)})))

(mu/defn make-request :- :hm-client/http-reply
  "Makes a request to the store-api-url with the given method, path, and body.

  Returns a tuple of [:ok response] if the request was successful, or [:error response] if it failed."
  [method :- [:enum :get :head :post :put :delete :options :copy :move :patch]
   url :- :string
   & [body]]
  (let [{:keys [store-api-url
                api-key]} (->config)
        request           (cond-> {:headers {"Authorization" (str "Bearer " api-key)
                                             "Content-Type" "application/json"}}
                            body (assoc :body (json/encode body)))
        request-method-fn (->requestor method)
        unparsed-response (send-request request-method-fn store-api-url url request)
        response          (decode-response unparsed-response url request)
        success?          (calculate-success response url request)]
    [(if success? :ok :error) response]))

;; OpenAPI-based API

(defn- bearer-auth [secret]
  {:name ::add-bearer-token
   :enter (fn [ctx] (assoc-in ctx [:request :headers "Authorization"] (str "Bearer " secret)))})

(defn- create-client
  [store-api-url api-key]
  (martian-http/bootstrap-openapi
   (str store-api-url "/openapi.json")
   ;; martian options for calling operations
   {:server-url   store-api-url
    :interceptors (into [(bearer-auth api-key)] martian-http/default-interceptors)}
   ;; clj-http options for loading the openapi.json itself
   {:headers {"Authorization" (str "Bearer " api-key)}}))

(def ^:private create-client-memo
  (memoize create-client))

(defn- client []
  (let [store-api-url (cloud-migration/store-api-url)
        api-key       (api.auth/api-key)]
    (when (str/blank? store-api-url)
      (log/error "Missing store-api-url. Cannot create hm client config.")
      (throw (ex-info (tru "Missing store-api-url.") {:store-api-url store-api-url})))
    (when (str/blank? api-key)
      (log/error "Missing api-key. Cannot create hm client config.")
      (throw (ex-info (tru "Missing api-key.") {:api-key api-key})))
    (create-client-memo store-api-url api-key)))

(defn explore
  "Explore the Harbormaster API, using Martian.
  e.g.
    (explore)                   ;; endpoint listing
    (explore :list-connections) ;; spec for the endpoint with operation-id :list-connections, from the (explore) call."
  [& args]
  (apply martian/explore (client) args))

(defn call
  "Call the API, using Martian. Will throw on non 2xx.
  e.g.
    ;; call the :foo endpoint with {:some-id id}
    ;; use (explore :list-connections) for params, if any, and pass them in a map
    (call :list-connections)"
  [operation-id & {:as args}]
  (try
    (:body (martian/response-for (client) operation-id args))
    (catch Exception e
      (log/errorf e "Error on Harbormaster operation call %s" operation-id)
      (throw e))))

(defn request
  "Same as call, but return the request that will be performed.
  Useful for debugging calls."
  [operation-id & {:as args}]
  (martian/request-for (client) operation-id args))

(comment
  ;; List all available operations on the API.
  (explore)
  ;; => [[:list-connections "Query connections for instance-id."]
  ;;     [:create-connection "Create a connection."]
  ;;     [:sync-connection "Sync a connection."]
  ;;     [:get-connection "Pull a connection."]
  ;;     [:update-connection "Update a connection."]
  ;;     [:delete-connection "Delete a connection."]]

  ;; Check params and returns for :list-connections
  (explore :list-connections)
  ;; => {:summary "Query connections for instance-id.",
  ;;     :parameters {},
  ;;     :returns
  ;;     {200
  ;;      [{{:k :hosted_instance_resource_id} Int,
  ;;        {:k :created_at} (cond-pre Str Inst),
  ;;        {:k :last_sync_at} Any,
  ;;        {:k :error_detail} Any,
  ;;        :type (enum "gdrive" "google_spreadsheet" "pg_replication" "sql_database"),
  ;;        {:k :status_reason} Any,
  ;;        {:k :last_sync_started_at} Any,
  ;;        {:k :updated_at} (cond-pre Str Inst),
  ;;        {:k :hosted_instance_id} (cond-pre Str Uuid),
  ;;        :status (enum "syncing" "error" "paused" "initializing" "active"),
  ;;        :id (cond-pre Str Uuid),
  ;;        :error Any}]}}

  ;; What's the request that (call :list-connections) will make?
  (request :list-connections)
  ;; => {:headers {"Authorization" "Bearer mb_api_key_128f293f4faca8ee89bdce1f36798e05c55715b4637801fac4a63101bb6f979d",
  ;;               "Accept" "application/json"},
  ;;     :method :get,
  ;;     :url "http://harbormaster:5010/api/v2/mb/connections",
  ;;     :as :text}

  ;; Call the :list-connections operation.
  (call :list-connections)
  ;; => ()
  )
