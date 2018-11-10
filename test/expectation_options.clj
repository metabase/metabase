(ns expectation-options
  "Namspace expectations will automatically load before running a tests")

(defn- tables-with-data->error-msg
  "Function that takes a list of modes and whill query each. If records are found, return a string with an error
  message"
  [models-to-check]
  (for [model models-to-check
        :let  [instances-found (count (model))
               more-than-one? (> 1 instances-found)]
        :when (< 0 instances-found)]
    (str "Found '" instances-found "' instance" (when more-than-one? "s")
         " of '" (:name model) "' that " (if more-than-one? "were" "was")
         " not cleaned up.")))

(def ^:private models-to-check
  "Add models from `metabase.models.*` to the following vector to have the `check-table-cleanup` function below error
  if any instances of that model are found after each test finishes."
  [])

(def ^:private slow-test-threshold-nanoseconds
  "Any test that takes longer than this time should be considered slow, and we should print a little notice about it!"
  (* 10 1000 1000 1000)) ; 10 seconds

(defn check-table-cleanup
  "Function that will run around each test. This function is usually a noop, but it useful for helping to debug stale
  data in local development. Modify the private `models-to-check` var to check if there are any rows in the given
  model's table after each expectation. If a row is found, the relevant information will be written to standard out
  and the test run will exit"
  {:expectations-options :in-context}
  [test-fn]
  (let [start-time-ns (System/nanoTime)
        result        (test-fn)
        total-time    (- (System/nanoTime) start-time-ns)]
    ;; TODO - we should also have a test timeout if it takes over 5 minutes or something like that
    (when (> total-time slow-test-threshold-nanoseconds)
      (println (let [{:keys [file line]} (-> test-fn meta :the-var meta)]
                 (format "Test %s:%s is SLOW: took %.1f seconds." file line (/ total-time (* 1000.0 1000.0 1000.0))))))
    ;; The typical case is no models-to-check, this then becomes a noop
    (when (seq models-to-check)
      (let [{:keys [file line]} (-> test-fn meta :the-var meta)
            error-msgs          (tables-with-data->error-msg models-to-check)]
        (when (seq error-msgs)
          (println "\n-----------------------------------------------------")
          (doseq [error-msg error-msgs]
            (println error-msg))
          (println "-----------------------------------------------------")
          (printf "\nStale test rows found in tables, check '%s' at line '%s'\n\n" file line)
          (flush)
          ;; I found this necessary as throwing an exception would show the exception, but the test run would hang and
          ;; you'd have to Ctrl-C anyway
          (System/exit 1))))
    result))
