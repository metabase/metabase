(ns metabase.query-processor.middleware.async)

(def ^:private in-flight* (agent 0))

(defn in-flight
  "Return the number of queries currently in flight."
  []
  @in-flight*)

(defn- call-thunk-on-completion-xform
  "A transducer that will call `thunk` when results are finished."
  [call-thunk-on-completion xf]
  (fn
    ([]
     (xf))

    ([result]
     (call-thunk-on-completion)
     (xf result))

    ([result results-metadata]
     (xf result results-metadata))

    ([result results-metadata row]
     (xf result results-metadata row))))

(defn count-in-flight-queries
  "Middleware that tracks the current number of queries in flight."
  [qp]
  (fn [query xformf {:keys [resultf], :as context}]
    (send in-flight* inc)
    (qp query xformf (assoc context :resultf (fn [result context]
                                               (send in-flight* dec)
                                               (resultf result context))))))
