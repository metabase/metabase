(ns metabase.global-system.mutable-component
  "The protocol for reading, binding and writing one component of the global system."
  (:refer-clojure :exclude [binding reset! reset-vals! swap! swap-vals!]))

(defprotocol MutableComponentHandle
  "Handle for reading and mutating a single component's stored value.
   Deref the handle to read the value currently visible to this thread."
  (binding [handle new-value thunk]
    "Calls `thunk` with the value rebound to `new-value` for the dynamic extent of the call.
     The binding is visible to `thunk`, the code it calls, and threads that inherit its bindings, such as a `future`.
     Those threads share the binding, so a write from any of them is seen by all.
     Returns what `thunk` returns.")
  (swap-vals!* [handle f args]
    "Atomically sets the value in the slot this thread reads to `(apply f old args)`, and returns `[old new]`.
     Inside a [[binding]] that slot is the bound value; otherwise it is the root, which every unbound thread sees.
     Outside a [[binding]], throws if the component has no root; use [[alter-root]] to install one.
     The function `f` can run more than once, so it must have no side effects.
     Prefer [[swap!]] or [[reset!]].")
  (alter-root [handle new-value]
    "Installs `new-value` as the root value and returns the value it replaced.
     Every thread sees it, this one included, except where an active [[binding]] of this component shadows it.
     Returns nil both when the old root was nil and when there was none; use [[root-entry]] to tell them apart.")
  (root-entry [handle]
    "The root as a map entry of component key to value, or nil when the component has no root.
     Ignores any [[binding]] on this thread.")
  (remove-root [handle]
    "Removes the root, so the component has no value outside a [[binding]] until [[alter-root]] installs one.")
  (without-binding [handle thunk]
    "Calls `thunk` with this thread's [[binding]] of the component removed, so `thunk` reads and writes the root.
     Bindings of other components are kept.
     Returns what `thunk` returns.")
  (slot-lock [handle]
    "An object to lock around a read-check-write of the slot this thread reads, when the check does work that
     cannot go in a [[swap!]] function, such as I/O.
     Every write to the slot holds it too, so no write lands inside such a section.
     A [[binding]] has its own lock, shared with the threads that inherit it; the root has one lock per component.
     Use [[with-slot-lock]] rather than calling this directly."))

;; Protocol methods can't take varargs, so these give callers the usual atom signatures over [[swap-vals!*]]. Unlike an
;; atom, a component with no root and no binding has no value, so each of them throws for one.
(defn swap-vals!
  "Like [[clojure.core/swap-vals!]]: applies `f` to the current value and any extra `args`, and returns `[old new]`.
   Visibility and the missing-component error are as for [[swap-vals!*]]."
  [handle f & args]
  (swap-vals!* handle f args))

(defn swap!
  "Like [[clojure.core/swap!]]: applies `f` to the current value and any extra `args`, and returns the new value.
   Visibility and the missing-component error are as for [[swap-vals!*]]."
  [handle f & args]
  (second (swap-vals!* handle f args)))

(defn reset-vals!
  "Like [[clojure.core/reset-vals!]]: sets the value and returns `[old new]`."
  [handle new-value]
  (swap-vals!* handle (constantly new-value) nil))

(defn reset!
  "Like [[clojure.core/reset!]]: sets the value and returns it."
  [handle new-value]
  (second (reset-vals! handle new-value)))

(defmacro with-slot-lock
  "Runs `body` holding the [[slot-lock]] of `handle`.
   Every write to the slot waits until `body` returns, and the lock is reentrant only on the holding thread.
   So `body` must not wait for another thread that writes this component or starts it."
  [handle & body]
  `(locking (slot-lock ~handle)
     ~@body))
