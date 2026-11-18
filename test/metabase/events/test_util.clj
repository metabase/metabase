(ns metabase.events.test-util
  "Helpers for tests that register consumers of the lifecycle events."
  (:require
   [metabase.events.batch :as events.batch]))

(defn unregister!
  "Remove the owned consumer, capture, statement capture and sink registered under `consumer-key`."
  [consumer-key]
  (doseq [registry [#'events.batch/owned-consumers #'events.batch/capturers #'events.batch/statement-capturers
                    #'events.batch/sinks]]
    (swap! @registry dissoc consumer-key))
  nil)
