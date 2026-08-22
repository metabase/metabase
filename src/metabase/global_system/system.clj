(ns metabase.global-system.system
  "Storage for the global system: one value per component, addressed by a namespace-qualified keyword.

   A dynamic Var has exactly two storage slots -- a root binding shared by every thread, and a per-thread
   binding that shadows it. The two collections below are those same two slots, keyed by component.

   Every root lives in one atom, so [[snapshot]] observes all components as of a single instant. The
   thread-local slot is an overlay holding only the components actually bound on this thread -- never a
   copy of the whole system. An unbound component therefore reads straight through to the root atom, which
   is what keeps components independent: binding, mutating, or re-rooting one component is invisible to
   every other, so a single var holding N components behaves the way N separate vars would, plus the
   consistent multi-component read that N separate vars cannot give you."
  (:require
   [metabase.global-system.mutable-component :as mc])
  (:import
   (clojure.lang IDeref)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Component key -> root value, shared by every thread."
           :private true}
  roots
  (atom {}))

(def ^{:doc "Component key -> atom holding that component's value for this thread and any thread the
             binding is conveyed to. Holds only the components bound here; everything else resolves
             against [[roots]]."
       :dynamic true
       :private true}
  *bound-boxes*
  {})

(defn snapshot
  "Every component's value as of a single instant, as this thread sees it: `(get (snapshot) k)` agrees with
   dereferencing that component's handle.

   Roots are read atomically, so components nobody has bound here can never disagree. Bound components are
   read one box at a time: a [[mc/binding]] conveyed to another thread (`future`, `pmap`, `send`) that
   mutates it while this runs can make those entries disagree. Snapshot from the thread that owns the
   binding to avoid that."
  []
  (merge @roots (update-vals *bound-boxes* deref)))

(defn- current-value
  "The value of `k` visible to this thread: the thread-local one if `k` is bound here, otherwise the root."
  [k]
  (if-let [box (get *bound-boxes* k)]
    @box
    (let [rs @roots]
      (if-let [entry (find rs k)]
        (val entry)
        (throw (ex-info (str "Component has no value: " k)
                        {:component  k
                         :components (sort (keys rs))}))))))

(defrecord ComponentHandle [k]
  IDeref
  (deref [_] (current-value k))

  mc/MutableComponentHandle
  (binding [_ new-value thunk]
    (clojure.core/binding [*bound-boxes* (assoc *bound-boxes* k (atom new-value))]
      (thunk)))
  (reset! [_ new-value]
    (if-let [box (get *bound-boxes* k)]
      (clojure.core/reset! box new-value)
      (do (clojure.core/swap! roots assoc k new-value)
          new-value)))
  (swap!* [_ f args]
    (if-let [box (get *bound-boxes* k)]
      (apply clojure.core/swap! box f args)
      (get (clojure.core/swap! roots (fn [rs] (apply update rs k f args))) k)))
  (alter-root [_ new-value]
    (let [[before _] (clojure.core/swap-vals! roots assoc k new-value)]
      (get before k))))

(defn mutable-component-handle
  "Make a component handle with state stored under a key in the global system."
  [k]
  (->ComponentHandle k))
