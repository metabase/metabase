(ns metabase.global-system.test-util
  (:require
   [metabase.global-system.mutable-component :as mc]))

(set! *warn-on-reflection* true)

(defonce ^:private root-lock (Object.))

;; Calls are serialized because two overlapping save/restore pairs would leave the second caller's value installed as
;; the "original" root once both finish.
(defn do-with-root
  "Install `value` as the root of the component behind `handle` for the extent of `thunk`, then restore the root it
  replaced, or remove the root if there was none.
  Unlike a binding, the root is seen by threads that do not inherit this thread's bindings, such as Quartz workers
  and the threads serving `mt/client`, so tests that call this must be `^:synchronized`.
  Calls are serialized, but only against each other: other code that reads or writes the root takes no lock."
  [handle value thunk]
  (locking root-lock
    (let [before (mc/root-entry handle)]
      (mc/alter-root handle value)
      (try
        (thunk)
        (finally
          (if before
            (mc/alter-root handle (val before))
            (mc/remove-root handle)))))))

(defmacro with-root
  "Run `body` with `value` installed as the root of the component behind `handle`. See [[do-with-root]]."
  {:style/indent [:defn]}
  [handle value & body]
  `(do-with-root ~handle ~value (^:once fn* [] ~@body)))
