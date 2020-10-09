(ns metabuild-common.steps
  (:require [clojure.main :as main]
            [colorize.core :as colorize]
            [metabuild-common
             [input :as in]
             [output :as out]]))

(declare do-step)

(defn- step-failure-repl-read [step-ns message thunk result]
  (fn [request-prompt request-exit]
    (let [input (main/repl-read request-prompt request-exit)]
      (condp = input
        'step
        (do
          (do-step step-ns message thunk)
          request-prompt)

        'continue
        (do
          (deliver result ::continue)
          request-exit)

        'fail
        (do
          (deliver result ::fail)
          request-exit)

        input))))

(defn- step-failure-repl [step-ns message thunk e]
  (out/safe-println (format "Starting REPL to debug step %s" (pr-str message)))
  (out/safe-println "The exception that triggered this REPL is defined as e*.")
  (out/safe-println "Type 'step' to retry the current step.")
  (out/safe-println "When you're ready to quit, type 'continue' to exit successfully and continue to the next")
  (out/safe-println "step, or 'fail' to exit unsuccessfully and return to the prompt that spawned this REPL.")
  (let [result (promise)]
    (main/repl :init (fn []
                       (require step-ns '[clojure.core :refer :all])
                       (in-ns step-ns)
                       (intern step-ns 'e* e))
               :read (step-failure-repl-read step-ns message thunk result))
    @result))

(defn handle-step-failure-interactive
  [step-ns message thunk ^Throwable e]
  (out/pretty-print-exception e)
  (out/error "Step %s failed with error %s" (pr-str message) (pr-str (.getMessage e)))
  (case (in/letter-options-prompt (str "What would you like to do?\n"
                                       "[T]ry this step again\n"
                                       "[F]ail -- pass the failure of this step to the parent step (which can be retried)\n"
                                       "[S]kip this step\n"
                                       "[R]EPL -- open a REPL so you can debug things\n"
                                       "[Q]uit the build script (or return to the top level if running from the REPL)")
                                  [:t :f :s :r :q])
    :t
    (do
      (out/safe-println (format "Retrying step %s" (pr-str message)))
      (do-step step-ns message thunk))

    :f
    (do
      (out/safe-println "Rethrowing Exception.")
      (throw (ex-info (str message) {} e)))

    :s
    (out/error "Skipping step %s" (pr-str message))

    :r
    (case (step-failure-repl step-ns message thunk e)
      ::continue (out/safe-println "Continuing to next step.")
      ::fail     (recur step-ns message thunk e))

    :q
    (throw (ex-info (.getMessage e)
                    (assoc (ex-data e) ::disable-interactive-debugging? true)
                    e))))

(defn do-step
  "Impl for `step` macro."
  [step-ns message thunk]
  (out/safe-println (colorize/green (str message)))
  (binding [out/*steps* (conj (vec out/*steps*) message)]
    (try
      (thunk)
      (catch Throwable e
        (when-not (in/interactive?)
          (throw (ex-info (str message) {} e)))
        (when (::disable-interactive-debugging? (ex-data e))
          (throw e))
        (handle-step-failure-interactive step-ns message thunk e)))))

(defmacro step
  "Start a new build step, which:

  1. Logs the `step` message
  2. Indents all output inside `body` by one level
  3. Catches any exceptions inside `body` and rethrows with additional context including `step` message

  These are meant to be nested, e.g.

    (step \"Build driver\"
      (step \"Build dependencies\")
      (step \"Build driver JAR\")
      (step \"Verify driver\"))"
  {:style/indent 1}
  [message & body]
  `(do-step '~(ns-name *ns*) ~message (fn [] ~@body)))
