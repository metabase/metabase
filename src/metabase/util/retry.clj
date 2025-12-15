(ns metabase.util.retry
  "Support for in-memory, thread-blocking retrying."
  (:require
   [diehard.core :as dh]
   [malli.util :as mut]
   [metabase.config.core :as config]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
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

;;; these kondo warnings are ignored for now because I'm planning on moving this namespace out of `util` to eliminate
;;; the dependency of `util` of `settings` -- will fix them after this namespace gets moved. -- Cam

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting retry-max-retries
  (deferred-tru "The maximum number of retries for an event.")
  :type :integer
  :default (if config/is-dev?
             0
             6))

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting retry-initial-interval
  (deferred-tru "The initial retry delay in milliseconds.")
  :type :integer
  :default 500)

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting retry-multiplier
  (deferred-tru "The delay multiplier between attempts.")
  :type :double
  :default 2.0)

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting retry-jitter-factor
  (deferred-tru "The jitter factor of the retry delay.")
  :type :double
  :default 0.1)

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting retry-max-interval-millis
  (deferred-tru "The maximum delay between attempts.")
  :type :integer
  :default 30000)

(defn retry-configuration
  "Returns a map with the default retry configuration."
  []
  {:max-retries (retry-max-retries)
   :initial-interval-millis (retry-initial-interval)
   :multiplier (retry-multiplier)
   :jitter-factor (retry-jitter-factor)
   :max-interval-millis (retry-max-interval-millis)})

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
