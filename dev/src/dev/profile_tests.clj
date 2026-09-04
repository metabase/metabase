(ns dev.profile-tests
  "Run tests under clj-async-profiler and write a flamegraph next to the JUnit output.

  clojure -X:dev:ci:ee:ee-dev:drivers:drivers-dev:test:profile-tests :only '[metabase.driver.bigquery-cloud-sdk-test]'

  `:profile-tests` must come after `:test` so its `:exec-fn` wins."
  (:require
   [clj-async-profiler.core :as prof]
   [metabase.test-runner :as test-runner]))

(defn run
  "`clojure -X` entrypoint. Takes the usual test-runner options plus:

  `:profile-event`    - async-profiler event (default `:wall`). `:wall` samples blocked threads too, which is
                        what you want for tests dominated by network round-trips; `:cpu` would miss them
                        entirely. `:cpu` additionally needs `kernel.perf_event_paranoid <= 1`.
  `:profile-interval` - sampling interval in nanoseconds (default 20ms). async-profiler's own 1ms default
                        is far too fine for a suite that runs for tens of minutes: raw stacks accumulate
                        at roughly 7 MB per minute of profiling at 10ms, and every halving of the
                        interval doubles that.

  Returns nothing; exits the JVM with the test result."
  [{:keys [profile-event profile-interval]
    :or   {profile-event :wall, profile-interval 20000000}
    :as   options}]
  (prof/start {:event profile-event, :interval profile-interval, :threads true})
  (let [summary (try
                  ;; `:mode :repl` so hawk returns the summary instead of calling `System/exit` — an exit here
                  ;; would skip flamegraph generation. It still writes JUnit XML and prints the pretty report.
                  (test-runner/find-and-run-tests-repl
                   (-> options
                       (dissoc :profile-event :profile-interval)
                       (assoc :mode :repl)))
                  (finally
                    (println "Wrote profile to" (str (prof/stop {:title (pr-str (:only options))})))))]
    (System/exit (if (pos? (+ (:error summary 0) (:fail summary 0))) 1 0))))
