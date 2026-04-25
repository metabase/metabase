(ns metabase.util.experiment
  "Framework for running experimental code paths alongside
  production code, comparing results, and reporting metrics.

   Usage:
     (experiment {:name :my-experiment :min-interval-ms 5000}
       (production-code)
       (experimental-code))

   Always returns the result of the production (control) code path.
   The candidate is only run when the global kill switch is on and
   the time-based throttle allows it."
  (:require
   [metabase.util.log :as log]
   [net.cgrand.macrovich :as macros])
  #?(:cljs (:require-macros [metabase.util.experiment])))

;;; ------------------------------------------------ Configuration ------------------------------------------------

(defonce ^{:private true
           :doc "Atom holding a zero-arg function that returns whether experiments are enabled.
   Defaults to (constantly true). On JVM, wired to the setting getter at startup.
   On CLJS, wired to read from bootstrap data."}
  experiments-enabled-fn
  (atom (constantly true)))

(defn experiments-enabled?
  "Returns true if experiments are globally enabled. Checks the setting on every call."
  []
  (@experiments-enabled-fn))

(defn set-experiments-enabled-fn!
  "Set the function that determines whether experiments are enabled.
   Called once at application startup to wire in the setting."
  [f]
  (reset! experiments-enabled-fn f))

(defonce ^{:private true
           :doc "Atom holding the default report function. Set at application startup via [[set-default-report-fn!]].
   Nil means no reporting. Can be overridden per-experiment via :report-fn in the opts map."}
  default-report-fn (atom nil))

(defn set-default-report-fn!
  "Set the default report function for experiment results."
  [f]
  (reset! default-report-fn f))

(def ^:dynamic *sync?*
  "When true, forces synchronous candidate execution on JVM. For testing only."
  false)

;;; -------------------------------------------------- Throttling -------------------------------------------------

(defonce ^:private last-run-times (atom {}))

(defn- current-time-ms []
  #?(:clj  (System/currentTimeMillis)
     :cljs (js/Date.now)))

(defn- throttle-allows?
  "Returns true if enough time has elapsed since the last run of this experiment."
  [experiment-name min-interval-ms]
  (let [now      (current-time-ms)
        last-run (get @last-run-times experiment-name 0)]
    (when (>= (- now last-run) min-interval-ms)
      (swap! last-run-times assoc experiment-name now)
      true)))

;;; --------------------------------------------- Outcome comparison ----------------------------------------------

(defn- outcomes-match?
  "Compare control and candidate outcomes. Both are {:result v} or {:error t}.
   Results match via comparator-fn. Errors match if same type, ex-message, and ex-data."
  [comparator-fn control candidate]
  (try
    (cond
      (and (contains? control :result) (contains? candidate :result))
      (comparator-fn (:result control) (:result candidate))

      (and (contains? control :error) (contains? candidate :error))
      (let [ce (:error control)
            ca (:error candidate)]
        (and (= (type ce) (type ca))
             (= (ex-message ce) (ex-message ca))
             (= (ex-data ce) (ex-data ca))))

      :else false)
    (catch #?(:clj Throwable :cljs :default) _
      false)))

;;; ------------------------------------------- Candidate execution -----------------------------------------------

(defn nanotime
  "Returns current time in nanoseconds. Cross-platform. Public because the `experiment` macro
   expands calls to this in the caller's namespace."
  []
  #?(:clj  (System/nanoTime)
     :cljs (* 1000000 (js/performance.now))))

(defn run-experiment*
  "Runtime implementation. Called by the `experiment` macro. Do not call directly.
   Checks the global kill switch and throttle, and if both allow, runs the candidate."
  [{:keys [name min-interval-ms comparator-fn report-fn]} control-outcome control-duration-ns candidate-thunk]
  (when (and (experiments-enabled?)
             (throttle-allows? name (or min-interval-ms 1000)))
    (let [comparator-fn (or comparator-fn =)
          report-fn (or report-fn @default-report-fn)
          run-fn
          (fn []
            (let [start             (nanotime)
                  candidate-outcome (try
                                      {:result (candidate-thunk)}
                                      (catch #?(:clj Throwable :cljs :default) t
                                        {:error t}))
                  end               (nanotime)
                  duration          (- end start)
                  match?            (outcomes-match? comparator-fn control-outcome candidate-outcome)]
              (when-not match?
                (if (contains? candidate-outcome :error)
                  (log/warnf "Experiment %s: candidate threw %s" name (str (:error candidate-outcome)))
                  (log/warnf "Experiment %s: result MISMATCH" name)))
              (when report-fn
                (report-fn {:name                  name
                            :match?                match?
                            :control-duration-ns   control-duration-ns
                            :candidate-duration-ns duration
                            :control-outcome       control-outcome
                            :candidate-outcome     candidate-outcome}))))]
      ;; NOTE: `future-call` conveys thread bindings automatically via `binding-conveyor-fn`.
      ;; If switching to a custom executor, capture bindings with `(get-thread-bindings)` before
      ;; submission, then restore them with `(push-thread-bindings)` / `(pop-thread-bindings)`
      ;; around the body in the worker thread.
      #?(:clj  (if *sync?* (run-fn) (future-call run-fn))
         :cljs (run-fn)))))

;;; --------------------------------------------------- Macro ----------------------------------------------------

(defmacro experiment
  "Run an experiment comparing control and candidate code paths.

   Always returns the control result (or re-throws the control exception).
   The candidate is only run when the global kill switch is on and
   the time-based throttle allows it.

   Options map:
     :name            - keyword identifying this experiment (required)
     :min-interval-ms - minimum ms between candidate runs (default 1000)
     :comparator-fn   - 2-arg fn for comparing results (default =)
     :report-fn       - 1-arg fn called with result map (default: the fn set via set-default-report-fn!)

   Usage:
     (experiment {:name :my-experiment}
       (control-expression)
       (candidate-expression))"
  {:style/indent 1}
  [opts control candidate]
  (assert (:name opts) ":name is required for experiment")
  `(let [start#           (nanotime)
         control-outcome# (try
                            {:result ~control}
                            (catch ~(macros/case :clj 'Throwable :cljs ':default) t#
                              {:error t#}))
         duration#        (- (nanotime) start#)]
     (run-experiment*
      ~opts
      control-outcome#
      duration#
      ~(macros/case
         :clj  `(^:once fn* [] ~candidate)
         :cljs `(fn [] ~candidate)))
     (if (contains? control-outcome# :error)
       (throw (:error control-outcome#))
       (:result control-outcome#))))
