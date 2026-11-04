(ns metabase.startup.core
  "Defines the `def-startup-validation!` and `def-startup-logic!` multimethods, which run when the server starts up:
  validations first (a throw aborts startup), then initialization logic."
  (:require
   [metabase.util :as u]
   [metabase.util.log :as log]))

(defmulti def-startup-validation!
  "Registers a startup precondition: all run before any `def-startup-logic!`, and a throw from one aborts startup.
  Order among validations is unspecified.
  Use this over `def-startup-logic!` for checks that must fail the boot before initialization logic runs.
  The dispatch value is any unique keyword, used only for logging.

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

    (defmethod startup/init-logic! ::ExampleLogic [_]
      (future (println \"Running example logic...\")))"
  {:arglists '([job-name-string])}
  keyword)

(defn- run-impl!
  "Invoke startup impl `f` for dispatch value `k`.
  When `abort-on-error?` a throw propagates (aborting startup); otherwise it is logged and swallowed."
  [k f abort-on-error?]
  (if abort-on-error?
    (f k)
    (try
      (f k)
      (catch Throwable e
        (log/errorf "Error initializing startup logic %s: %s" k (ex-message e))))))

(defn- run-startup-logic!*
  "Run `validation-impls` (each aborts the boot on a throw), then `setup-impls` (throws logged and skipped).
  Each is a seq of `[dispatch-value f]` pairs."
  [validation-impls setup-impls]
  (doseq [[k f] validation-impls]
    (log/infof "Running startup validation %s" (u/format-color 'green (name k)))
    (run-impl! k f true))
  (doseq [[k f] setup-impls]
    (log/infof "Running setup logic %s %s" (u/format-color 'green (name k)) (u/emoji "☑️"))
    (run-impl! k f false)))

(defn run-startup-logic!
  "Run all `def-startup-validation!` implementations (a throw aborts startup), then all `def-startup-logic!`
  implementations (errors logged and skipped). Called by metabase.core/init!"
  []
  (run-startup-logic!* (methods def-startup-validation!)
                       (methods def-startup-logic!)))
