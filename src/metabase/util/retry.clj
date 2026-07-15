(ns metabase.util.retry
  "Support for in-memory, thread-blocking retrying.
  Pure machinery: callers pass a retry-config map.
  The admin-tunable default lives in `metabase.channel.settings/retry-configuration`."
  (:require
   [diehard.core :as dh]
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::retry-config
  [:map
   [:max-retries              :int]
   [:initial-interval-millis  :int]
   [:multiplier               :float]
   [:jitter-factor            :float]
   [:max-interval-millis      :int]])

(mr/def ::retry-overrides
  (mut/optional-keys [:ref ::retry-config]))

(defn retry-configuration->diehard-map
  "Transform retry configuration map into a format understood by Diehard."
  [{:keys [initial-interval-millis max-interval-millis multiplier] :as retry-conf}]
  (cond-> (select-keys retry-conf
                       [:on-retry :max-duration-ms :listener :max-retries :on-complete :retry-on :on-success :abort-on
                        :retry-if :on-abort :backoff-ms :jitter-factor :jitter-ms :fallback :abort-if :circuit-breaker
                        :on-failure :delay-ms :on-failed-attempt :retry-when :abort-when :policy :on-retries-exceeded])
    initial-interval-millis (assoc :backoff-ms (cond-> [initial-interval-millis max-interval-millis]
                                                 multiplier (conj multiplier)))))

(def ^:dynamic *test-time-config-hook*
  "This should only be used during testing to modify the final config map passed to Diehard."
  identity)

(defmacro with-retry
  "Execute `body`, retrying on thrown exceptions or certain values if requested. See `retry-configuration` for default
  configuration, and also `diehard.core/with-retry` which is used underneath this macro."
  [options-map & body]
  `(dh/with-retry (retry-configuration->diehard-map (*test-time-config-hook* ~options-map)) ~@body))
