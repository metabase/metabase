(ns metabase.util.retry
  "Support for in-memory, thread-blocking retrying."
  (:require [metabase.models.setting :refer [defsetting]]
            [metabase.util.i18n :refer [deferred-tru]])
  (:import
   (io.github.resilience4j.core IntervalFunction)
   (io.github.resilience4j.retry Retry RetryConfig)
   (java.util.function Predicate)))

(set! *warn-on-reflection* true)

(defsetting retry-max-attempts
  (deferred-tru "The maximum number of attempts for an event.")
  :type :integer
  :default 7)

(defsetting retry-initial-interval
  (deferred-tru "The initial retry delay in milliseconds.")
  :type :integer
  :default 500)

(defsetting retry-multiplier
  (deferred-tru "The delay multiplier between attempts.")
  :type :double
  :default 2.0)

(defsetting retry-randomization-factor
  (deferred-tru "The randomization factor of the retry delay.")
  :type :double
  :default 0.1)

(defsetting retry-max-interval-millis
  (deferred-tru "The maximum delay between attempts.")
  :type :integer
  :default 30000)

(defn- retry-configuration []
  {:max-attempts (retry-max-attempts)
   :initial-interval-millis (retry-initial-interval)
   :multiplier (retry-multiplier)
   :randomization-factor (retry-randomization-factor)
   :max-interval-millis (retry-max-interval-millis)})

(defn- make-predicate [f]
  (reify Predicate (test [_ x] (f x))))

(defn random-exponential-backoff-retry
  "Returns a randomized exponential backoff retry named `retry-name`
  configured according the options in the second parameter."
  ^Retry [^String retry-name
          {:keys [^long max-attempts ^long initial-interval-millis
                  ^double multiplier ^double randomization-factor
                  ^long max-interval-millis
                  retry-on-result-pred retry-on-exception-pred]}]
  (let [interval-fn (IntervalFunction/ofExponentialRandomBackoff
                     initial-interval-millis multiplier
                     randomization-factor max-interval-millis)
        base-config (-> (RetryConfig/custom)
                        (.maxAttempts max-attempts)
                        (.intervalFunction interval-fn))
        retry-config (cond-> base-config
                       retry-on-result-pred
                       (.retryOnResult (make-predicate retry-on-result-pred))
                       retry-on-exception-pred
                       (.retryOnException (make-predicate retry-on-exception-pred)))]
    (Retry/of retry-name (.build retry-config))))

(defn decorate
  "Returns a function accepting the same arguments as `f` but retrying on error
  as specified by `retry`.
  The calling thread is blocked during the retries. This function should be used to
  trigger retries across the BE, but keep in mind to not chain retries with this function."
  ([f]
   (decorate f (random-exponential-backoff-retry (str (random-uuid)) (retry-configuration))))
  ([f ^Retry retry]
   (fn [& args]
     (let [callable (reify Callable (call [_] (apply f args)))]
       (.call (Retry/decorateCallable retry callable))))))
