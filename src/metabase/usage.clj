(ns metabase.usage
  (:require [com.climate.claypoole :as cp]
            [java-time.api :as t]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:const batch-size
  "How many usage records to process at once."
  1000)

(def ^:private ^:const process-queue-interval-ms
  "How long to wait between processing the usage queue and the next run."
  1000)

(def ^:private ^:const error-interval-ms
  "How long to wait until retrying processing the usage queue after an error."
  1000)

(def ^:dynamic *track-sync*
  "Track usage immediately (for testing)"
  false)

(defmacro with-synchronous-tracking-enabled
  "For testing purposes, track usage immediately."
  [& body]
  `(binding [*track-sync* true]
     ~@body))

(def ^:private queue
  "A map of [model id] tuples to the last used timestamp."
  (atom nil))

(defn column
  "The column name for the last used at field."
  [model]
  (case model
    :model/Dashboard :last_viewed_at
    :model/Card      :last_used_at))

(defn- update-last-used-at! [model jobs]
  (t2/update! (t2/table-name model)
              :id [:in (map :id jobs)]
              {(column model) (into [:case]
                                    (mapcat (fn [{:keys [id timestamp]}]
                                              [[:= :id id] [:greatest
                                                            [:coalesce
                                                             (column model)
                                                             (t/offset-date-time 0)]
                                                            timestamp]])
                                            jobs))}))

(defn track!
  "Tracks the usage of a single instance. Inside `with-synchronous-tracking-enabled`,
  this will happen immediately. Otherwise, it will be queued for later processing."
  [model id]
  (let [job {:id        id
             :model     model
             :timestamp (t/offset-date-time)}]
    (if *track-sync*
      (update-last-used-at! model [job])
      (swap! queue (fn [queue]
                     (let [key ((juxt :model :id) job)
                           existing (get queue key)]
                       (if (or (nil? existing)
                               (t/after? (:timestamp job) (:timestamp existing)))
                         (assoc queue key job)
                         queue)))))))

(defn- nanos-to-ms [ns] (/ ns 1e6))

(defn- run-process-job! []
  (let [start-time (System/nanoTime)
        jobs   @queue]
    (if-not (compare-and-set! queue jobs nil)
      ;; Something else appended to the queue or is processing it.
      {::result      ::failed-to-dequeue
       ::duration-ms (nanos-to-ms (- (System/nanoTime) start-time))
       ::queue-size  (count jobs)}
      (let [queue-size        (count jobs)
            model->jobs       (group-by :model (vals jobs))
            model->split-jobs (update-vals model->jobs (fn [jobs]
                                                         (partition-all batch-size jobs)))]
        (when (seq jobs)
          #_:clj-kondo/ignore
          (cp/with-shutdown! [tp (cp/threadpool 4)]
            (cp/pdoseq tp [[model jobs] model->split-jobs
                           job-set jobs]
              (update-last-used-at! model job-set))))
        {::result      ::processed-queue
         ::queue-size  queue-size
         ::duration-ms (nanos-to-ms (- (System/nanoTime) start-time))}))))

(defn- start-processing-worker!
  []
  (loop [result ::started]
    (Thread/sleep
     (case result
       ;; Initial run
       ::started           0
       ;; The queue was modified before we could `compare-and-set!` it.
       ::failed-to-dequeue 0
       ;; Processing the queue was successful
       ::processed-queue   process-queue-interval-ms
       ;; An error occurred
       ::error             error-interval-ms))
    (let [{:keys [::result ::duration-ms ::queue-size]}
          (try (run-process-job!)
               (catch Throwable e
                 (log/error e "Error processing usage queue.")
                 {::result ::error}))]
      (log/debugf "Processed usage queue in %sms [result: %s, queue-size: %s]"
                  (Math/round ^Double duration-ms)
                  (name result)
                  queue-size)
      (recur result))))

(def ^:private worker
  "An atom containing the worker future."
  (atom nil))

(defn init!
  "Starts up the system, returning the worker future."
  []
  (let [w (future (start-processing-worker!))]
    (reset! worker w)
    w))

(defn stop!
  "Stops the worker and processes the remaining jobs."
  ([] (stop! @worker))
  ([worker]
   (future-cancel worker)
   (while (seq @queue)
     (run-process-job!))))
