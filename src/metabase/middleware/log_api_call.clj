(ns metabase.middleware.log-api-call
  "Middleware to log API calls. Primarily for debugging purposes."
  (:require [clojure.math.numeric-tower :as math]
            [clojure.pprint :refer [pprint]]
            [clojure.tools.logging :as log]
            [colorize.core :as color]))

(declare api-call?
         log-request
         log-response)

(def ^:private sensitive-fields
  "Fields that we should censor before logging."
  #{:password})

(defn- scrub-sensitive-fields
  "Replace values of fields in `sensitive-fields` with `\"**********\"` before logging."
  [request]
  (clojure.walk/prewalk (fn [form]
                          (if-not (and (vector? form)
                                       (= (count form) 2)
                                       (keyword? (first form))
                                       (contains? sensitive-fields (first form)))
                            form
                            [(first form) "**********"]))
                        request))

(def ^:private only-display-output-on-error
  "Set this to `false` to see all API responses."
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

(defn- log-request [{:keys [uri request-method body query-string]}]
  (log/debug (color/blue (format "%s %s " (.toUpperCase (name request-method)) (str uri
                                                                                    (when-not (empty? query-string)
                                                                                      (str "?" query-string))))
                         (when (or (string? body) (coll? body))
                           (str "\n" (with-out-str (pprint (scrub-sensitive-fields body))))))))

(defn- log-response [{:keys [uri request-method]} {:keys [status body]} elapsed-time]
  (let [log-error (fn [& args] (log/error (apply str args))) ; inconveniently these are not macros
        log-debug (fn [& args] (log/debug (apply str args)))
        log-warn  (fn [& args] (log/warn  (apply str args)))
        [error? color-fn log-fn] (cond
                                   (>= status 500) [true  color/red   log-error]
                                   (=  status 403) [true  color/red   log-warn]
                                   (>= status 400) [true  color/red   log-debug]
                                   :else           [false color/green log-debug])]
    (log-fn (color-fn (format "%s %s %d (%d ms)" (.toUpperCase (name request-method)) uri status elapsed-time)
                      (when (or error? (not only-display-output-on-error))
                        (when (or (string? body) (coll? body))
                          (str "\n" (with-out-str (pprint body)))))))))
