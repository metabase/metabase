(ns metabase.middleware.log-api-call
  "Middleware to log API calls. Primarily for debugging purposes."
  (:require [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]))

(declare api-call?
         log-request)

(defn log-api-call
  "Middleware to log `:request` and/or `:response` by passing corresponding OPTIONS."
  [handler & options]
  (let [{:keys [request response]} (set options)
        log-request? request
        log-response? response]
    (fn [request]
      (if-not (api-call? request) (handler request)
              (do
                (when log-request?
                  (log-request request))
                (let [response (time (handler request))]
                  (when log-response?
                    (log/debug (with-out-str (pprint response))))
                  response))))))

(defn- api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (and (>= (count uri) 4)
       (= (.substring uri 0 4) "/api")))

(defn- log-request [{:keys [uri request-method params]}]
  (log/debug (.toUpperCase (name request-method)) uri) (when-not (empty? params)
                                                         (with-out-str (pprint params))))
