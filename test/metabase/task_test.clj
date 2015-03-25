(ns metabase.task-test
  (:require [expectations :refer :all]
            (metabase [task :refer :all]
                      [test-setup :refer :all]))
  (:import java.util.Calendar))

(defhook task-test-hook "Hook for test purposes.")

(def task-test-atom
  (atom 0))

(defn- inc-task-test-atom []
  (swap! task-test-atom inc))

(defn- inc-task-test-atom-twice []
  (swap! task-test-atom (partial + 2)))

;; ## HOOK TESTS

(expect
    [0  ; (1)
     1  ; (2)
     3  ; (3)
     6  ; (4)
     9] ; (5)
  [;; (1) get initial value
   (do (reset! task-test-atom 0)   ; reset back to 0
       (run-hook #'task-test-hook)
       @task-test-atom)

   ;; (2) now add a hook function. Should increment the counter once
   (do (add-hook! #'task-test-hook inc-task-test-atom)
       (run-hook #'task-test-hook)
       @task-test-atom)

   ;; (3) ok, run the hook twice. Should increment counter twice
   (do (run-hook #'task-test-hook)
       (run-hook #'task-test-hook)
       @task-test-atom)

   ;; (4) add another hook function that increments counter twice on each call (for a total of + 3)
   (do (add-hook! #'task-test-hook inc-task-test-atom-twice)
       (run-hook #'task-test-hook)
       @task-test-atom)

   ;; (5) check that we can't add duplicate hooks - should still be just +3
   (do (add-hook! #'task-test-hook inc-task-test-atom-twice)
       (run-hook #'task-test-hook)
       @task-test-atom)])


;; ## TASK RUNNER TESTS

(defn- system-hour []
  (.get (Calendar/getInstance) Calendar/HOUR))

(defn- inc-task-test-atom-by-system-hour [hour]
  (swap! task-test-atom (partial + (system-hour))))

;; we'll temporarily swap out the `hourly-tasks-hook` functions
;; so the tests don't cause some crazy database analysis or w/e to start up
(def ^:private original-hourly-tasks-hook-functions
  (atom nil))
(defn- stash-original-hourly-tasks-hook-functions!   [] (reset! original-hourly-tasks-hook-functions @hourly-tasks-hook))
(defn- restore-original-hourly-tasks-hook-functions! [] (reset! hourly-tasks-hook @original-hourly-tasks-hook-functions))

(expect [0
         (system-hour)       ; we can also check that the `hourly-tasks-hook` is passing the correct param to its functions
         (* 3 (system-hour))
         :ok]
  (do
    ;; stop the task runner and set the internal interval to 30 ms.
    ;; Add `inc-task-test-atom-by-system-hour` to the `hourly-tasks-hook` and restart
    (stop-task-runner!)
    (stash-original-hourly-tasks-hook-functions!)
    (intern 'metabase.task 'hourly-task-delay 30)
    (add-hook! #'hourly-tasks-hook inc-task-test-atom-by-system-hour)
    (reset! task-test-atom 0)
    (start-task-runner!)

    [@task-test-atom       ; should be 0, since not enough time has elaspsed for the hook to be executed
     (do (Thread/sleep 45)
         @task-test-atom)  ; should have been called once (~15ms ago)
     (do (Thread/sleep 60)
         @task-test-atom)  ; should have been called two more times

     ;; no put things back how we found them
     (do (stop-task-runner!)
         (intern 'metabase.task 'hourly-task-delay (* 1000 60 60))
         (restore-original-hourly-tasks-hook-functions!)
         (start-task-runner!)
         :ok)]))
