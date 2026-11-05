(ns metabase.global-system.system
  "Storage for the global system, with one value per component, addressed by a namespace-qualified keyword.

   A dynamic var has two slots: a root shared by every thread, and a per-thread binding that shadows it.
   This namespace keeps the same two slots for every component.
   All roots live in one atom, so [[snapshot]] reads every root at a single instant.
   Each thread's bindings are an overlay holding only the components bound on that thread, never a copy of the system.
   An unbound component reads straight through to its root, so binding or changing one component never affects
   another."
  (:require
   [clojure.pprint :as pprint]
   [metabase.global-system.mutable-component :as mc])
  (:import
   (clojure.lang IDeref)
   (java.io Writer)
   (java.util.concurrent ConcurrentHashMap)
   (java.util.function Function)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Component key -> root value, shared by every thread."
           :private true}
  roots
  (atom {}))

;; The dynamic var is the one place thread-local component values live, which is what lets a binding of one component
;; leave every other component reading its root.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^{:doc "Component key -> atom holding that component's bound value, shared with threads that inherit the binding.
             Holds only the components bound here; everything else resolves against [[roots]]."
       :dynamic true
       :private true}
  *bound-boxes*
  {})

(defn snapshot
  "Every component's value as this thread sees it.
   For an installed component, `(get (snapshot) k)` is what dereferencing its handle returns.
   Roots are read in one step, so the components nobody has bound here are consistent with each other.
   Bound components are read one at a time, and a thread that inherited a binding can change one mid-read."
  []
  (merge @roots (update-vals *bound-boxes* deref)))

(defn component-bound-fn
  "A function that calls `f` with its arguments under this thread's component bindings, and no other bindings, for
   handing `f` to another thread.
   That thread shares the bindings, so its writes are seen here too."
  [f]
  (let [boxes *bound-boxes*]
    (fn [& args]
      (clojure.core/binding [*bound-boxes* boxes]
        (apply f args)))))

(defn- root-value
  "The root value of `k` in the roots map `rs`.
   Throws if `k` was never installed with [[mc/alter-root]]."
  [rs k]
  (if-let [entry (find rs k)]
    (val entry)
    (throw (ex-info (str "Component has no value: " k)
                    {:component  k
                     :components (sort (keys rs))}))))

(defonce ^{:doc "Component key -> the lock for that component's root slot."
           :private true}
  root-locks
  (ConcurrentHashMap.))

(defn- root-lock
  "The lock for the root slot of `k`, the same object every time for a given `k`."
  [k]
  (.computeIfAbsent ^ConcurrentHashMap root-locks k (reify Function (apply [_ _] (Object.)))))

(defmacro ^:private with-root-lock
  "Run `body` holding the lock for the root slot of `k`."
  [k & body]
  `(let [lock# (root-lock ~k)]
     (locking lock#
       ~@body)))

(defn- current-value
  "The value of `k` visible to this thread: the bound one if `k` is bound here, otherwise the root."
  [k]
  (if-let [box (get *bound-boxes* k)]
    @box
    (root-value @roots k)))

;; A deftype, not a record: a record would be a map as well as an IDeref, and a handle is neither a value nor a
;; lookup.
(deftype ComponentHandle [k]
  IDeref
  (deref [_] (current-value k))

  mc/MutableComponentHandle
  (binding [_ new-value thunk]
    (clojure.core/binding [*bound-boxes* (assoc *bound-boxes* k (atom new-value))]
      (thunk)))
  ;; Every write holds its slot's lock, so a [[mc/with-slot-lock]] read-check-write is never interleaved with one.
  (swap-vals!* [_ f args]
    (if-let [box (get *bound-boxes* k)]
      (locking box
        (apply swap-vals! box f args))
      (with-root-lock k
        (let [[before after] (swap-vals! roots (fn [rs] (assoc rs k (apply f (root-value rs k) args))))]
          [(get before k) (get after k)]))))
  (alter-root [_ new-value]
    (with-root-lock k
      (let [[before _] (swap-vals! roots assoc k new-value)]
        (get before k))))
  (root-entry [_]
    (find @roots k))
  (remove-root [_]
    (with-root-lock k
      (swap! roots dissoc k))
    nil)
  (without-binding [_ thunk]
    (clojure.core/binding [*bound-boxes* (dissoc *bound-boxes* k)]
      (thunk)))
  (slot-lock [_]
    (or (get *bound-boxes* k)
        (root-lock k))))

;; Prints the key alone. The IDeref defaults would deref the handle, which throws when the component has no value.
(defmethod print-method ComponentHandle
  [^ComponentHandle handle ^Writer w]
  (.write w (str "#<ComponentHandle " (pr-str (.-k handle)) ">")))

(defmethod pprint/simple-dispatch ComponentHandle
  [handle]
  (print-method handle *out*))

(defn mutable-component-handle
  "Make a handle for the component stored under `k` in the global system.
   With `init-root`, a function of no arguments, also install its result as the root if the component has none, so
   reloading the namespace that makes the handle leaves an installed root alone."
  ([k]
   (ComponentHandle. k))
  ([k init-root]
   (let [handle (ComponentHandle. k)]
     (with-root-lock k
       (when-not (mc/root-entry handle)
         (mc/alter-root handle (init-root))))
     handle)))
