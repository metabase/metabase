(ns metabase.middleware.log-api-call
  "Middleware to log API calls. Primarily for debugging purposes."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]
            [colorize.core :as color]))

(declare api-call?
         log-request
         log-response)

(def ^:private only-display-output-on-error
  "Set this to `false` to see out API responses."
  true)

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
                (let [start-time (System/nanoTime)
                      response (handler request)
                      elapsed-time (-> (- (System/nanoTime) start-time)
                                       double
                                       (/ 1000000.0)
                                       math/round)]
                  (when log-response?
                    (log-response request response elapsed-time))
                  response))))))

(defn- api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (and (>= (count uri) 4)
       (= (.substring uri 0 4) "/api")))

(defn- log-request [{:keys [uri request-method body]}]
  (log/debug (color/blue (format "%s %s " (.toUpperCase (name request-method)) uri)
                         (when-let [body-output (with-out-str (pprint body))]
                           (str "\n" body-output)))))

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time]
  (let [error? (>= status 400)
        color-fn (if error? color/red color/green)]
    (log/debug (color-fn (format "%s %s %d (%d ms)" (.toUpperCase (name request-method)) uri status elapsed-time)
                         (when (and error? only-display-output-on-error)
                           (when-let [body-output (with-out-str (pprint body))]
                             (str "\n" body-output)))))))
