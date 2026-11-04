(ns metabase.global-system.system
  "Storage for the global system, with one value per component, addressed by a namespace-qualified keyword.

   A dynamic var has two slots: a root shared by every thread, and a per-thread binding that shadows it.
   This namespace keeps the same two slots for every component.
   All roots live in one atom, so [[snapshot]] reads every root at a single instant.
   Each thread's bindings are an overlay holding only the components bound on that thread, never a copy of the system.
   An unbound component reads straight through to its root, so binding or changing one component never affects
   another.

   A component can also be started on first use with [[ensure-started!]], which records how to stop it, and [[halt!]]
   stops every started component, last started first."
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
  "Wrap `f` to run under the component bindings this thread has now, for handing to another thread.
   Unlike [[bound-fn]], the wrapper carries no other bindings, so the thread that runs it keeps its own.
   That thread shares the component bindings, so its writes are seen here too."
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

;;; ------------------------------------------------ Lifecycle ------------------------------------------------

;; Entries are matched by component key, not handle, since reloading a namespace makes a new handle for the same key.
(defonce ^{:doc "The components [[ensure-started!]] started, as `{:k key, :handle h, :stop f}` maps in start order."
           :private true}
  started-components
  (atom []))

(defn- handle-key
  [^ComponentHandle handle]
  (.-k handle))

(defn- bound-here?
  "Whether this thread has a binding of the component behind `handle`."
  [handle]
  (contains? *bound-boxes* (handle-key handle)))

(defn- registered-stop
  "The stop function [[ensure-started!]] recorded for the component behind `handle`, or nil if it did not start it."
  [handle]
  (some #(when (= (handle-key handle) (:k %)) (:stop %)) @started-components))

(defn start!
  "Like [[ensure-started!]], but returns `[value started?]`, where `started?` says whether this call started the
   component."
  [handle start stop]
  (if (bound-here? handle)
    [@handle false]
    (let [current @handle]
      (if (some? current)
        [current false]
        (mc/with-slot-lock handle
          (let [current @handle]
            (if (some? current)
              [current false]
              (let [k       (handle-key handle)
                    started (start)]
                (when (nil? started)
                  (throw (ex-info (str "Starting component returned nil: " k) {:component k})))
                ;; Registered before the root is published, so the root is never visible unregistered, and anything
                ;; that starts after seeing it, and so may depend on it, registers after it and halts before it.
                ;; Components `start` itself started registered first, for the same reason.
                (swap! started-components (fn [entries]
                                            (conj (filterv #(not= k (:k %)) entries)
                                                  {:k k, :handle handle, :stop stop})))
                (mc/reset! handle started)
                [started true]))))))))

(defn ensure-started!
  "The value of the component behind `handle` as this thread sees it, starting the component first if it has none.
   Starting calls `start` with no arguments, which must return a non-nil value, installs that as the root, and records
   `stop`, a function of the value, for [[stop!]] and [[halt!]].
   Threads racing to start the component start it once.
   A thread that binds the component gets the bound value, nil included, and starts nothing.
   The component's root must already be installed, usually as nil by [[mutable-component-handle]].
   A component started while [[halt!]] runs may be left running."
  [handle start stop]
  (first (start! handle start stop)))

(defn- unregister!
  "Remove the [[started-components]] entry for the component behind `handle`."
  [handle]
  (let [k (handle-key handle)]
    (swap! started-components (fn [entries] (filterv #(not= k (:k %)) entries)))))

(defn stop!
  "Stop the component behind `handle` if [[ensure-started!]] started it: set its root back to nil, then call the stop
   function recorded at start on the value it held.
   Returns true if there was a running component to stop.
   Leaves alone a component [[ensure-started!]] did not start, and any binding on this thread, since bindings are
   never started."
  [handle]
  (mc/without-binding
   handle
   (fn []
     (mc/with-slot-lock handle
       (if-let [stop (registered-stop handle)]
         (let [[old _] (mc/reset-vals! handle nil)]
           (unregister! handle)
           (when (some? old)
             (stop old))
           (some? old))
         false)))))

(defn- stop-all!
  "Call [[stop!]] on each of `handles` in order.
   A stop that throws does not prevent the rest; once all have run, throws an ex-info whose `:failures` holds each
   component key with its exception."
  [handles]
  (let [failures (into []
                       (keep (fn [handle]
                               (try
                                 (stop! handle)
                                 nil
                                 (catch Throwable e
                                   [(handle-key handle) e]))))
                       handles)]
    (when (seq failures)
      (throw (ex-info "Some components failed to stop"
                      {:failures failures}
                      (second (first failures)))))))

(defn- halt-order
  "The handles of the components [[ensure-started!]] started, in the order [[halt!]] stops them: last started first."
  []
  (map :handle (rseq @started-components)))

(defn halt!
  "Stop every component [[ensure-started!]] started, in reverse start order.
   Throws after trying them all if any stop threw; see [[stop-all!]]."
  []
  (stop-all! (halt-order)))
