(ns metabase.startup.core
  "Defines the server lifecycle multimethods. `def-startup-validation!` and `def-startup-logic!` run at
  startup: validations first (a throw aborts startup), then initialization logic. `def-shutdown-logic!`
  runs at graceful shutdown."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defmulti def-startup-validation!
  "Registers a startup precondition. All implementations run before any `def-startup-logic!`, in
  unspecified order; a throw from any of them aborts startup. Use this (not `def-startup-logic!`) for
  checks that must fail the boot before initialization logic (e.g. rejecting a removed setting), so
  nothing expensive kicks off first.

  The dispatch value can be any unique keyword and is used purely for logging.

    (defmethod startup/def-startup-validation! ::ExampleCheck [_]
      (when (misconfigured?) (throw (ex-info \"Bad config\" {}))))"
  {:arglists '([validation-name])}
  keyword)

(defmulti def-startup-logic!
  "Runs initialization logic with a given name. All implementations of this method are called once and only
  once when the server is starting up. Task namespaces (`metabase.*.task`) should add new
  implementations of this method that run the needed logic.

  The dispatch value for this function can be any unique keyword and is used purely for logging purposes.

  The function will block startup until it returns, so use `quick-task/submit-task!` if you want to run it in the background.

  For logic that should run on only one node at a time, use `cluster-lock/with-cluster-lock` in your function.

  To control ordering, add a [[startup-priority]] method for the same dispatch value (lower
  priorities run first; default 0).

    (defmethod startup/init-logic! ::ExampleLogic [_]
      (future (println \"Running example logic...\")))"
  {:arglists '([job-name-string])}
  keyword)

(defmulti startup-priority
  "Ordering priority for [[def-startup-logic!]] implementations. Lower runs first; higher runs
  later. Default is 0. Use `Long/MAX_VALUE` for logic that must run after everything else."
  {:arglists '([job-name-string])}
  keyword)

(defmethod startup-priority :default [_] 500)

(defn run-startup-logic!
  "Run all `def-startup-validation!` implementations (a throw aborts startup), then all
  `def-startup-logic!` implementations. Called by metabase.core/init!
  Logic methods run in ascending [[startup-priority]] order, with ties broken by dispatch-value name
  for determinism; their errors are logged and skipped."
  []
  (doseq [[k f] (methods def-startup-validation!)]
    (log/infof "Running startup validation %s" (u/format-color 'green (name k)))
    (f k))
  (doseq [[k f] (sort-by (fn [[k _]] [(startup-priority k) (name k)])
                         (methods def-startup-logic!))]
    (try
      (log/infof "Running setup logic %s %s" (u/format-color 'green (name k)) (u/emoji "☑️"))
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
