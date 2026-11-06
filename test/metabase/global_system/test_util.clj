(ns metabase.global-system.test-util
  (:require
   [metabase.global-system.mutable-component :as mc]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defonce ^:private root-lock (Object.))

(defn- at-root-locked
  "Call `f` with this thread's binding of the component removed and its root slot locked."
  [handle f]
  (mc/without-binding handle (fn [] (mc/with-slot-lock handle (f)))))

;; Calls are serialized because two overlapping save/restore pairs would leave the second caller's value installed as
;; the "original" root once both finish. The save and the restore each hold the component's slot lock, so neither
;; lands inside a [[mc/with-slot-lock]] section, but the body does not, since its worker threads may write the root.
(defn do-with-root
  "Install `value` as the root of the component behind `handle` for the extent of `thunk`, then restore the root it
  replaced, or remove the root if there was none.
  Unlike a binding, the root is seen by threads that do not inherit this thread's bindings, such as Quartz workers
  and the threads serving `mt/client`, so tests that call this must not be `^:parallel`.
  A thread that binds the component keeps reading its binding.
  Calls are serialized against each other."
  [handle value thunk]
  (locking root-lock
    (let [before (at-root-locked handle #(u/prog1 (mc/root-entry handle)
                                           (mc/alter-root handle value)))]
      (try
        (thunk)
        (finally
          (at-root-locked handle #(if before
                                    (mc/alter-root handle (val before))
                                    (mc/remove-root handle))))))))

(defmacro with-root
  "Run `body` with `value` installed as the root of the component behind `handle`. See [[do-with-root]]."
  {:style/indent [:defn]}
  [handle value & body]
  `(do-with-root ~handle ~value (^:once fn* [] ~@body)))
