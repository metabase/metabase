(ns metabase.startup.core
  "Defines the `def-startup-logic!` and `def-shutdown-logic!` multimethods for server lifecycle hooks."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defmulti def-startup-logic!
  "Runs initialization logic with a given name. All implementations of this method are called once and only
  once when the server is starting up. Task namespaces (`metabase.*.task`) should add new
  implementations of this method that run the needed logic.

  The dispatch value for this function can be any unique keyword and is used purely for logging purposes.

  The function will block startup until it returns, so use `quick-task/submit-task!` if you want to run it in the background.

  For logic that should run on only one node at a time, use `cluster-lock/with-cluster-lock` in your function.

    (defmethod startup/init-logic! ::ExampleLogic [_]
      (future (println \"Running example logic...\")))"
  {:arglists '([job-name-string])}
  keyword)

(defn run-startup-logic!
  "Call all implementations of `def-startup-logic!`. Called by metabase.core/init!"
  []
  (doseq [[k f] (methods def-startup-logic!)]
    (try
      (log/infof "Running setup logic %s %s" (u/format-color 'green (name k)) (u/emoji "☑\uFE0F"))
      (f k)
      (catch Throwable e
        (log/errorf e "Error initializing startup logic %s" k)))))

(defmulti def-shutdown-logic!
  "Runs shutdown logic with a given name. All implementations are called during graceful server
  shutdown. Counterpart to [[def-startup-logic!]].

  The dispatch value can be any unique keyword and is used for logging."
  {:arglists '([job-name-string])}
  keyword)

(defn run-shutdown-logic!
  "Call all implementations of `def-shutdown-logic!`. Called during graceful server shutdown."
  []
  (doseq [[k f] (methods def-shutdown-logic!)]
    (try
      (log/infof "Running shutdown logic %s" (name k))
      (f k)
      (catch Throwable e
        (log/errorf e "Error running shutdown logic %s" k)))))
