(ns metabase.util.concurrent
  (:import [java.util.concurrent Executors ExecutorCompletionService Future TimeUnit]))

(set! *warn-on-reflection* true)

(defn ecs-map
  "Applies function f to each item in collection coll using an ExecutorCompletionService for parallel execution.
  Returns a sequence of results in the same order as the input collection.

  Parameters:
  f         - The function to apply to each item in coll. It should be thread-safe.
  coll      - The input collection to process.

  Optional keyword args:
  :timeout   - Maximum time in milliseconds to wait for all tasks to complete.
               If exceeded, throws an ex-info with :kind ::timeout.
  :pool-size - The number of threads in the executor pool.
               Defaults to (+ 2 (number of available processors)).

  Returns:
  A sequence containing the results of applying f to each item in coll.

  Throws:
  ExceptionInfo - If the timeout is exceeded. The exception contains:
                  {:kind ::timeout
                   :timeout <specified timeout>
                   :pool-size <specified or default pool size>}
  Any exception thrown by f will be propagated to the caller.

  Notes:
  - The function creates a fixed thread pool which is shut down after all tasks complete or timeout.
  - The order of execution is not guaranteed, but the order of results matches the input collection.
  - If a timeout occurs, any unfinished tasks will be cancelled.
  - This function is particularly useful for IO-bound operations that can benefit from parallelism.

  Example usage:
  (ecs-map #(slurp (str \"https://example.com/api/\" %))
           [\"resource1\" \"resource2\" \"resource3\"]
           :timeout 5000
           :pool-size 10)

  This will concurrently fetch data from those resource URLs, using a pool of 10 threads,
  and timeout after 5 seconds if all operations haven't completed."
  [f coll & {:keys [timeout pool-size]
             :or {pool-size (+ 2 (.availableProcessors (Runtime/getRuntime)))}}]
  (let [pool (Executors/newFixedThreadPool pool-size)
        ecs (ExecutorCompletionService. pool)
        futures (for [item coll] (.submit ecs ^Callable #(f item)))
        start-time (System/currentTimeMillis)
        deadline (when timeout (+ start-time timeout))]
    (try
      (doall (map
              (fn [^Future fut]
                (if deadline
                  ;; If a timeout is specified, calculate remaining time and wait for it:
                  (.get fut (- deadline (System/currentTimeMillis)) TimeUnit/MILLISECONDS)
                  (.get fut)))
              futures))
      (catch java.util.concurrent.TimeoutException
          e
          (throw (ex-info "Timeout exceeded while waiting for tasks to complete"
                        {:kind ::timeout
                         :timeout timeout
                         :pool-size pool-size
                         :message (.getMessage e)
                         :cause e})))
      (finally (.shutdownNow pool)))))
