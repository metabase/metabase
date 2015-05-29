(ns metabase.task-test
  (:require [expectations :refer :all]
            (metabase [task :refer :all]
                      [test-setup :refer :all]))
  (:import java.util.Calendar))

(defhook task-test-hook "Hook for test purposes.")

(def task-test-atom-counter
  (atom 0))

(defn- inc-task-test-atom-counter []
  (swap! task-test-atom-counter inc))

(defn- inc-task-test-atom-counter-twice []
  (swap! task-test-atom-counter (partial + 2)))

;; ## HOOK TESTS

(expect
    [0  ; (1)
     1  ; (2)
     3  ; (3)
     6  ; (4)
     9] ; (5)
  [;; (1) get initial value
   (do (reset! task-test-atom-counter 0)   ; reset back to 0
       (run-hook #'task-test-hook)
       @task-test-atom-counter)

   ;; (2) now add a hook function. Should increment the counter once
   (do (add-hook! #'task-test-hook inc-task-test-atom-counter)
       (run-hook #'task-test-hook)
       @task-test-atom-counter)

   ;; (3) ok, run the hook twice. Should increment counter twice
   (do (run-hook #'task-test-hook)
       (run-hook #'task-test-hook)
       @task-test-atom-counter)

   ;; (4) add another hook function that increments counter twice on each call (for a total of + 3)
   (do (add-hook! #'task-test-hook inc-task-test-atom-counter-twice)
       (run-hook #'task-test-hook)
       @task-test-atom-counter)

   ;; (5) check that we can't add duplicate hooks - should still be just +3
   (do (add-hook! #'task-test-hook inc-task-test-atom-counter-twice)
       (run-hook #'task-test-hook)
       @task-test-atom-counter)])


;; ## TASK RUNNER TESTS

(defn- system-hour []
  (.get (Calendar/getInstance) Calendar/HOUR))

(defn- inc-task-test-atom-counter-by-system-hour [hour]
  (swap! task-test-atom-counter (partial + (system-hour))))

(defhook mock-hourly-tasks-hook
  "Hook that will replace the actual hourly-tasks-hook in our unit test.")

(expect [[0
          (system-hour)       ; we can also check that the `hourly-tasks-hook` is passing the correct param to its functions
          (* 3 (system-hour))
          :stopped]
         :restarted]
  [(do
     (stop-task-runner!)
     (with-redefs [metabase.task/hourly-task-delay (constantly 100)
                   metabase.task/hourly-tasks-hook mock-hourly-tasks-hook]
       (add-hook! #'hourly-tasks-hook inc-task-test-atom-counter-by-system-hour)
       (reset! task-test-atom-counter 0)
       (start-task-runner!)

       [@task-test-atom-counter      ; should be 0, since not enough time has elaspsed for the hook to be executed
        (do (Thread/sleep 150)
            @task-test-atom-counter) ; should have been called once (~50ms ago)
        (do (Thread/sleep 200)
            @task-test-atom-counter) ; should have been called two more times
        (do (stop-task-runner!)
            :stopped)]))
   (do (start-task-runner!)
       :restarted)])
