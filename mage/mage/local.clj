(ns mage.local
  (:require
   [babashka.tasks :as bt]
   [mage.util :as u]))

(def ^:private file-name "me.edn")

(defn assemble-task-thunk
  "
   Lemon
   - _z_
   - [[xxx]]
   -  __xx__
   - *x*

   **x**
   
    ```
   (defn a [x] (+ x x))
   ;; => 3
   ``` 
  "
  [{:keys [requires task enter exit]
    :as task-value}
   top-level-enter
   top-level-exit]
  (fn []
    (doseq [r requires] (require r))
    (when top-level-enter (top-level-enter))
    (when enter (enter))
    #_:clj-kondo/ignore
    (let [o (eval task)]
      (when exit (exit))
      (when top-level-exit (top-level-exit))
      o)))

(defn- run [input]
  (let [local-file
        (try (slurp file-name)
             (catch Exception _
               (spit file-name (pr-str '{:tasks {my-task (println "hi")}}))
               (throw (ex-info (str "missing " file-name ". I've auto-initialized it.\n"
                                    " Try running:\n"
                                    "mage local my-task")
                               {:babashka/exit 1}))))
        local-bb-edn
        (try (some->>
              local-file
              read-string)
             (catch Exception _
               (throw (ex-info (str file-name " is unreadable!")
                               {:contents local-file :babashka/exit 1}))))
        local-tasks
        (try (some->> local-bb-edn :tasks)
             (catch Exception _
               (throw (ex-info (str file-name " is missing :tasks!")
                               {:contents local-bb-edn
                                :babashka/exit 1}))))
        task (symbol (first input))
        task-value (get local-tasks task)
        task-thunk (if (map? task-value)
                     (assemble-task-thunk task-value
                                          (:enter local-bb-edn)
                                          (:exit local-bb-edn))
                     #_:clj-kondo/ignore
                     (fn [] (eval task-value)))]
    (u/debug "Local Tasks:\n" (pr-str local-tasks))
    (if-let [the-task (get local-tasks task)]
      (do
        (u/debug "Task: " (pr-str the-task))
        (task-thunk))
      (throw (ex-info "Unknown task" {})))))
