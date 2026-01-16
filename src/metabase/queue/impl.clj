(ns metabase.queue.impl
  (:require
   [metabase.queue.backend :as q.backend]))

(set! *warn-on-reflection* true)

(def defined-queues
  "Atom containing a map of defined queue names to their configuration."
  (atom {}))

(defn define-queue!
  "Ensure the queue with the given name exists. Must be called before publishing or listening to the queue.
  The queue name must be namespaced to 'queue', e.g. :queue/test-queue."
  [queue-name]
  (assert (= "queue" (namespace queue-name))
          (str "Queue name must be namespaced to 'queue', e.g. :queue/test-queue, but was " queue-name))
  (when-not (contains? @defined-queues queue-name)
    (q.backend/define-queue! q.backend/*backend* queue-name)
    (swap! defined-queues assoc queue-name {})))

(defn check-valid-queue
  "Throws an exception if the queue name is not valid or not defined."
  [queue-name]
  (when-not (= "queue" (namespace queue-name))
    (throw (ex-info "Queue name must be namespaced to 'queue'"
                    {:queue              queue-name
                     :expected-namespace "queue"})))
  (when-not (contains? @defined-queues queue-name)
    (throw (ex-info "Queue not defined" {:queue queue-name}))))
