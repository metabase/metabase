(ns dev.memory
  (:require
   [metabase.util.log :as log])
  (:import
   (java.lang.management ManagementFactory)))

;; measurement requires reflection as we don't know the concrete class
;; we can't using `binding` for this variable as it needs to be set at
;; compile time.
(set! *warn-on-reflection* false)

(defn- get-thread-allocated-bytes
  "Measure the cumulative bytes allocated by a thread, ignoring whether its been collected."
  []
  (let [mx-bean   (ManagementFactory/getThreadMXBean)
        ;; `getId`` is deprecated, we will need to update to `threadId` at some point.
        thread-id (.getId (Thread/currentThread))]
    ;; this method is only defined for some platform implementations.
    (assert (.isThreadAllocatedMemorySupported mx-bean))
    (.getThreadAllocatedBytes mx-bean thread-id)))

(set! *warn-on-reflection* true)

(defn mb-str
  "Format bytes as megabytes"
  [bytes]
  (format "%.3f MB" (/ (double bytes) 1024 1024)))

(defn measure-thread-allocations
  "Measure the number of bytes allocated when calling the given function."
  [f]
  (let [before (get-thread-allocated-bytes)
        result (f)
        after  (get-thread-allocated-bytes)]
    {:result      result
     :allocations (- after before)}))

(defmacro measuring-thread-allocations
  "Measure the number of bytes allocated when evaluating the given body."
  [& body]
  `(let [m# (measure-thread-allocations #(do ~@body))]
     (log/warnf "Allocated: %s" (mb-str (:allocations m#)))
     (:result m#)))

(comment
  ;; almost correct, at least a constant error
  (measuring-thread-allocations
   (byte-array (* 1024 1024)))
  ;; => 1.028MB
  ;; => 1.028MB
  ;; => 1.028MB
  )
