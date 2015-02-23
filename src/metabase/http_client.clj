(ns metabase.http-client
  "HTTP client for making API calls against the Metabase API. For test/REPL purposes."
  (:require [clojure.data.json :as json]
            [clj-http.client :as client]))

(declare build-url)

;; ## API Client
;; This should be considered a work-in-progress as it does not yet support authentication.
;; (method signatures subject to change)

(def ^:dynamic *url-prefix*
  "Prefix to automatically prepend to the URL of calls made with `client`."
  "http://localhost:3000/api/")

(defn client
  "Perform an API call and return the response (for test purposes).
   The first arg after URL will be passed as a JSON-encoded body if it is a map.
   Other &rest kwargs will be passed as `GET` parameters.

  examples:

    (client :get \"card/1\")                    ; GET  http://localhost:3000/api/card/1
    (client :get \"card\" :org 1)               ; GET  http://localhost:3000/api/card?org=1
    (client :post \"card\" {:name \"My Card\"}) ; POST http://localhost:3000/api/card with JSON-encoded body {:name \"My Card\"}"
  [method url & args]
  {:pre [(contains? #{:get :post} method)]}
  (let [[body & kwparams] (if (map? (first args)) args
                              (apply vector nil args))
        request-fn (case method
                     :get client/get
                     :post (fn [url]
                             (client/post url {:content-type :json
                                               :body (json/write-str body)})))
        url (build-url url (when-not (empty? kwparams)
                             (apply assoc {} kwparams)))]
    (println url)
    (let [{:keys [status body]} (try (request-fn url)
                                     (catch clojure.lang.ExceptionInfo e
                                       (-> (.getData ^clojure.lang.ExceptionInfo e)
                                           :object)))]
      (println "STATUS:" status)
      (try (-> body
               json/read-str
               clojure.walk/keywordize-keys)
           (catch Exception _
             body)))))

;; TODO - does this need to URL encode params (e.g. " " -> "%20")?
(defn- build-url [url kwparams]
  (str *url-prefix* url (when kwparams
                          (str "?" (->> kwparams
                                        (map (fn [[k v]]
                                               [(if (keyword? k) (name k) k)
                                                (if (keyword? v) (name v) v)]))
                                        (map (partial interpose "="))
                                        (map (partial apply str))
                                        (interpose "&")
                                        (apply str))))))
