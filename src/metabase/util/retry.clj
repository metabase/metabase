(ns metabase.util.retry
  "Support for in-memory, thread-blocking retrying."
  (:import
   (io.github.resilience4j.core IntervalFunction)
   (io.github.resilience4j.retry Retry RetryConfig)
   (java.util.function Predicate)))

(set! *warn-on-reflection* true)

(defn- make-predicate [f]
  (reify Predicate (test [_ x] (f x))))

(defn random-exponential-backoff-retry
  "Returns a randomized exponential backoff retry named `retry-name`
  configured according the options in the second parameter."
  ^Retry [^String retry-name
          {:keys [^long max-attempts ^long initial-interval-millis
                  ^double multiplier ^double randomization-factor
                  ^long max-interval-millis
                  retry-on-result-pred retry-on-exception-pred]
           :or {max-attempts 3
                initial-interval-millis 500
                multiplier 1.5
                randomization-factor 0.5
                max-interval-millis Long/MAX_VALUE}}]
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
  The calling thread is blocked during the retries."
  [f ^Retry retry]
  (fn [& args]
    (let [callable (reify Callable (call [_] (apply f args)))]
      (.call (Retry/decorateCallable retry callable)))))
