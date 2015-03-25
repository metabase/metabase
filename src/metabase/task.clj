;; -*- comment-column: 60; -*-
(ns metabase.task
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u])
  (:import java.util.Calendar))

;; # HOOKS
;; [Just like in Emacs Lisp](http://www.gnu.org/software/emacs/manual/html_node/elisp/Hooks.html) (well, almost) <3
;;
;; Define a hook with `defhook`, add functions to it with `add-hook!`, and run those functions later with `run-hook`:
;;
;;     (defhook hourly-tasks-hook \"Tasks to run hourly\") ; define a new hook.
;;     (add-hook! #'hourly-tasks-hook my-fn-to-run-hourly) ; add a function to the hook
;;     (run-hook #'hourly-tasks-hook :parallel)            ; run the functions associated with a hook
;;
;; See the docstrs of these functions below for further discussion.
;;
;; ### Robert Hooke
;; Yes, I known [`robert-hooke`](https://github.com/technomancy/robert-hooke) exists.
;; This library is actually bascially an implementation of Emacs Lisp [`advice`](http://www.gnu.org/software/emacs/manual/html_node/elisp/Advising-Functions.html),
;; not `add-hook`. Which is what we want here. Also, the implementation below is only like ~20 LOC so no need to pull in a 3rd-party library IMO.
;;
;; ### Differences from Emacs Lisp
;;
;;     (defun add-hook (hook function &optional append local)
;;       ...)
;;     (add-hook 'my-wacky-hook #'some-fun t t)
;;
;; 1.  In Elisp, calling `add-hook` with an undefined hook will just create the hook for you. We're not allowing that here so we can do
;;     some safety checking.
;; 2.  You can't define a `buffer-local` hook because there's no such thing in Clojure
;; 3.  Excution order of *hook functions* here are indeterminate since they're stored in a set
;; 4.  We can run our *hook functions* in parallel <3
;;
(defmacro defhook
  "Define a new hook.

    (defhook hourly-tasks-hook \"Tasks to run hourly\")

  A hook is simply an atom storing a set of functions that you can run at any time with `run-hook`."
  [hook-name & [docstr?]]
  {:arglists '([hook-name docstr?])}
  `(do (def ~hook-name
            (atom #{}))
       (alter-meta! #'~hook-name merge {:doc ~docstr?
                                        :type ::hook})))

;; TODO Should we require that F be a var so as to avoid duplicate lambdas being added ?
(defn add-hook!
  "Add function F to HOOK (hereafter, known as one of HOOK's *hook functions*).
   Calling `(run-hook #'hook)` at a later time will call this function.

    (add-hook! #'hourly-tasks-hook my-fn-to-run-hourly)

  Note that you are expected to pass the var literal of HOOK; this is so we can check its metadata.
  Hooks are tagged with `:type -> :metabase.task/hook` which is checked as a precondition so you
  don't accidentally use this function the wrong way."
  [hook f]
  {:pre [(var? hook)
         (= (:type (meta hook)) ::hook)
         (fn? f)]}
  (swap! (var-get hook) conj f))

;; TODO - remove-hook! function

(defn run-hook
  "Run the *hook functions* associated with HOOK sequentially (by default) or in parallel if `:parallel` is
   passed as the first arg. All subsequent args will be passed directly to the *hook functions* themselves.

    (run-hook #'hourly-tasks-hook :parallel)

  Like `add-hook!`, you are expected to pass the var literal of HOOK so we can do some safety checks for you."
  {:arglists '([hook parallel? & args])}
  [hook & args]
  {:pre [(var? hook)
         (= (:type (meta hook)) ::hook)]}
  (let [[parallel args] (u/optional (partial = :parallel) args)
        map-fn (if parallel pmap #(dorun (map %1 %2)))]
    (map-fn (u/rpartial apply args)
            @(var-get hook))))


;; # TASK RUNNER
;; The task runner is a set of hooks like `hourly-tasks-hook` that get called at certain intervals on a background thread.
;; Just add functions to these hooks with `add-hook!` and they'll be ran at the appropriate time.

;; ## STANDARD TASK RUNNER HOOKS

(defhook hourly-tasks-hook
  "Tasks to run hourly.
   Functions will be passed a single function: the current hour (according to the system calendar) in 24-hour time.

    (defn some-task [hour]
        do-something ...)
    (add-hook! #'hourly-tasks-hook some-task) ; now some-task will be called on a background thread every hour")

(defhook nightly-tasks-hook
  "Tasks to run nightly at midnight (according to the system calendar).
   Functions will be passed no arguments.")

(defn- hour
  "Current hour (0 - 23) according to the system calendar."
  []
  (.get (Calendar/getInstance) Calendar/HOUR))

(defn- minute
  "Current minute (0 - 59) according to the system calendar."
  []
  (.get (Calendar/getInstance) Calendar/MINUTE))

(defn- minutes-until-next-hour
  "Number of minutes (1 - 60) until the top of the *next* hour."
  []
  (- 60 (minute)))

(defn- hourly-task-delay
  "Number of milliseconds to wait before running hourly tasks the next time around.

   This is the number of milliseconds until the top of the next hour; e.g., if the test runner is started
   with `(start-task-runner!)` at 8:23 PM, this function will return the number of milliseconds until 9:00 PM,
   which will be first time we'd want

   (This is provided here so the unit tests can replace this fn so we can test the scheduling mechanism.)"
  []
  (* 1000 60 (minutes-until-next-hour)))

;; TODO: Does it matter whether we run at the top of each hour or just once per hour?
(defn- run-hourly-tasks
  "Run the `hourly-tasks-hook` in parallel, then sleep for an hour."
  []
  ;; Sleep first, that way we're not trying to run a ton of tasks as soon as Metabase spins up
  (Thread/sleep (hourly-task-delay))
  (log/info "Running hourly tasks...")
  (run-hook #'hourly-tasks-hook :parallel (hour))
  (recur))

(defn- run-nightly-tasks
  "Run the `nightly-tasks-hook` (in parallel).
   This is acutally just a *hook function* added to the `hourly-tasks-hook`;
   it just checks whether the system hour is `0`, and, if so, runs the `nightly-tasks-hook`."
  [hour]
  (when (= hour 0)
    (log/info "Running nightly tasks...")
    (run-hook #'nightly-tasks-hook :parallel)))
(add-hook! #'hourly-tasks-hook run-nightly-tasks)

(defonce ^:private task-runner
  (atom nil))

(defn start-task-runner!
  "Start a background thread that will run tasks on the `hourly-tasks-hook` and `nightly-tasks-hook` every hour / every night, respectively. "
  []
  (when-not @task-runner
    (log/info "Starting task runner...")
    (reset! task-runner (future (run-hourly-tasks)))))

(defn stop-task-runner!
  "Stop the task runner."
  []
  (when @task-runner
    (log/info "Stopping task runner...")
    (future-cancel @task-runner)
    (reset! task-runner nil)))

;; Now start up the task runner


;; TODO -
