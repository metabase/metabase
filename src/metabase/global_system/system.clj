(ns metabase.global-system.system
  "Storage for the global system, with one value per component, addressed by a namespace-qualified keyword.

   A dynamic var has two slots: a root shared by every thread, and a per-thread binding that shadows it.
   This namespace keeps the same two slots for every component.
   All roots live in one atom, so [[snapshot]] reads every root at a single instant.
   Each thread's bindings are an overlay holding only the components bound on that thread, never a copy of the system.
   An unbound component reads straight through to its root, so binding or changing one component never affects
   another."
  (:require
   [metabase.global-system.mutable-component :as mc])
  (:import
   (clojure.lang IDeref)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Component key -> root value, shared by every thread."
           :private true}
  roots
  (atom {}))

;; The dynamic var is the one place thread-local component values live, which is what lets a binding of one component
;; leave every other component reading its root.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^{:doc "Component key -> atom holding that component's value on this thread and on threads that inherit its
             bindings.
             Holds only the components bound here; everything else resolves against [[roots]]."
       :dynamic true
       :private true}
  *bound-boxes*
  {})

(defn snapshot
  "Every component's value as this thread sees it, so `(get (snapshot) k)` agrees with dereferencing the handle for `k`.
   Roots are read in one step, so components nobody has bound here are consistent with each other.
   Bound components are read one at a time, and a thread that inherited a binding can change one mid-read."
  []
  (merge @roots (update-vals *bound-boxes* deref)))

(defn- no-value
  "The error for a component `k` that has no root in the roots map `rs`."
  [rs k]
  (ex-info (str "Component has no value: " k)
           {:component  k
            :components (sort (keys rs))}))

(defn- root-value
  "The root value of `k` in the roots map `rs`.
   Throws if `k` was never installed with [[mc/alter-root]]."
  [rs k]
  (if-let [entry (find rs k)]
    (val entry)
    (throw (no-value rs k))))

(defn- current-value
  "The value of `k` visible to this thread: the bound one if `k` is bound here, otherwise the root."
  [k]
  (if-let [box (get *bound-boxes* k)]
    @box
    (root-value @roots k)))

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
      (do (clojure.core/swap! roots (fn [rs]
                                      (if (contains? rs k)
                                        (assoc rs k new-value)
                                        (throw (no-value rs k)))))
          new-value)))
  (swap!* [_ f args]
    (if-let [box (get *bound-boxes* k)]
      (apply clojure.core/swap! box f args)
      (get (clojure.core/swap! roots (fn [rs] (assoc rs k (apply f (root-value rs k) args)))) k)))
  (alter-root [_ new-value]
    (let [[before _] (clojure.core/swap-vals! roots assoc k new-value)]
      (get before k)))
  (without-binding [_ thunk]
    (clojure.core/binding [*bound-boxes* (dissoc *bound-boxes* k)]
      (thunk))))

(defn mutable-component-handle
  "Make a handle for the component stored under `k` in the global system."
  [k]
  (->ComponentHandle k))
