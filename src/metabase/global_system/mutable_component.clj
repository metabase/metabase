(ns metabase.global-system.mutable-component
  "The protocol for reading, binding and writing one component of the global system."
  (:refer-clojure :exclude [binding reset! swap!]))

(defprotocol MutableComponentHandle
  "Handle for reading and mutating a single component's stored value.
   Deref the handle to read the value currently visible to this thread."
  (binding [handle new-value thunk]
    "Calls `thunk` with the value rebound to `new-value` for the dynamic extent of the call.
     The binding is visible to `thunk`, the code it calls, and threads that inherit its bindings, such as a
     `future` started inside it.
     Those threads share the binding, so a [[reset!]] or [[swap!]] from any of them is seen by all.")
  (reset! [handle new-value]
    "Sets the value in whichever slot this thread currently reads.
     Inside a [[binding]] that is the bound value; otherwise it is the root, which every thread outside a
     [[binding]] sees.
     Outside a [[binding]], throws if the component has no root; use [[alter-root]] to install one.")
  (swap!* [handle f args]
    "Same as [[swap!]] but takes `args` as an explicit collection.
     Prefer [[swap!]] in most cases.")
  (alter-root [handle new-value]
    "Installs `new-value` as the root value and returns the value it replaced.
     Every thread sees it, this one included, except where an active [[binding]] of this component shadows it.")
  (without-binding [handle thunk]
    "Calls `thunk` with this thread's [[binding]] of the component removed, so `thunk` reads and writes the root.
     Bindings of other components are kept."))

;; Protocol methods can't take varargs, so this wraps [[swap!*]] to give callers the usual `swap!` signature.
(defn swap!
  "Updates the value by applying `f` to the current value and any extra `args`, and returns the new value.
   Visibility and the missing-component error are the same as for [[reset!]]."
  [handle f & args]
  (swap!* handle f args))
