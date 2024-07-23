(ns metabase.query-analysis.failure-map
  (:import
   (java.util.concurrent ConcurrentHashMap)
   (java.util.function BiFunction)))

(set! *warn-on-reflection* true)

(def ^:private ^ConcurrentHashMap cached-failures (ConcurrentHashMap.))

(def ^:private max-size 10000)

(def ^:private max-retries 2)

(defn- ->query-hash [card]
  (hash (:dataset_query card)))

(defn reset-map!
  "Used by tests"
  []
  (.clear cached-failures))

(defn track-failure!
  "Record when we have failed to analyze a given version of a card, to prevent endless retrying."
  [card]
  ;; This size operation is close to constant time at the moment - watch out if you change the data structure.
  (.compute cached-failures (:id card)
            (reify BiFunction
              (apply [_this _k existing]
                (let [hsh (->query-hash card)]
                  (if (= hsh (:query-hash existing))
                    (update existing :retries-remaining #(max 0 (dec %)))
                    (when (< (.size cached-failures) max-size)
                      {:query-hash hsh :retries-remaining (dec max-retries)})))))))

(defn track-success!
  "Once we manage to analyze a card, we can forget about previous failures."
  [card]
  (.remove cached-failures (:id card)))

(defn non-retryable?
  "Should we skip retrying the given card because it has failed too many times?"
  [card]
  (boolean
   (when-let [{:keys [retries-remaining query-hash]} (.get cached-failures (:id card))]
     (and (zero? retries-remaining)
          (= query-hash (->query-hash card))))))
