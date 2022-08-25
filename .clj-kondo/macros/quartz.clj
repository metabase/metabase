(ns macros.quartz)

(defmacro build-job
  [& body]
  `(let [jb# (org.quartz.JobBuilder/newJob)]
     (clojurewerkz.quartzite.jobs/finalize (-> jb# ~@body))))

(defmacro build-trigger
  [& body]
  `(let [tb# (org.quartz.TriggerBuilder/newTrigger)]
     (clojurewerkz.quartzite.triggers/finalize (-> tb# ~@body))))

(defmacro simple-schedule
  [& body]
  `(-> {} ~@body))

(defmacro schedule
  [& body]
  `(let [s# ~(first body)]
     (-> s# ~@(rest body))))
