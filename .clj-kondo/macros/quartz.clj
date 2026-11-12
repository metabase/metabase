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

(defmacro defjob-type
  "A `deftype` with no fields, without the docstring and the options map."
  [type-name & args]
  `(deftype ~type-name [] ~@(drop-while (some-fn string? map?) args)))
