(ns metabase.task
  "Background task scheduling via Quartzite.  Individual tasks are defined in `metabase.task.*`"
  (:require clojure.java.classpath
            [clojure.tools.logging :as log]
            [clojure.tools.namespace.find :as ns-find]
            [clojurewerkz.quartzite.scheduler :as qs]))


(defonce ^:private quartz-scheduler
  (atom nil))

(defn- find-and-load-tasks
  "Search Classpath for namespaces that start with `metabase.tasks.`, then `require` them so initialization can happen."
  []
  (->> (ns-find/find-namespaces (clojure.java.classpath/classpath))
       (filter (fn [ns-symb]
                 (re-find #"^metabase\.task\." (name ns-symb))))
       set
       (map (fn [events-ns]
              (log/info "\tloading tasks namespace: " events-ns)
              (require events-ns)))
       dorun))

(defn start-scheduler!
  "Start our Quartzite scheduler which allows jobs to be submitted and triggers to begin executing."
  []
  (when-not @quartz-scheduler
    (log/debug "Starting Quartz Scheduler")
    ;; keep a reference to our scheduler
    (reset! quartz-scheduler (-> (qs/initialize) qs/start))
    ;; look for job/trigger definitions
    (find-and-load-tasks)))

(defn stop-scheduler!
  "Stop our Quartzite scheduler and shutdown any running executions."
  []
  (log/debug "Stopping Quartz Scheduler")
  ;; tell quartz to stop everything
  (qs/shutdown @quartz-scheduler)
  ;; reset our scheduler reference
  (reset! quartz-scheduler nil))


(defn schedule-task!
  "Add a given job and trigger to our scheduler."
  [job trigger]
  (when @quartz-scheduler
    (qs/schedule @quartz-scheduler job trigger)))
