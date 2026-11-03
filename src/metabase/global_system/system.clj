(ns metabase.global-system.system
  "Storage for the global system, with one value per component, addressed by a namespace-qualified keyword.

   A dynamic var has two slots: a root shared by every thread, and a per-thread binding that shadows it.
   This namespace keeps the same two slots for every component.
   All roots live in one atom, so [[snapshot]] reads every root at a single instant.
   Each thread's bindings are an overlay holding only the components bound on that thread, never a copy of the system.
   An unbound component reads straight through to its root, so binding or changing one component never affects
   another.

   A component can also be started on first use with [[ensure-started!]], which records how to stop it, and [[halt!]]
   stops every started component, each before the components it uses, and otherwise last started first."
  (:require
   [clojure.pprint :as pprint]
   [metabase.global-system.mutable-component :as mc]
   [weavejester.dependency :as dep])
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

;; Keyed by component key, not handle, since reloading a namespace makes a new handle for the same key.
(defonce ^{:doc "Component key -> `{:handle h, :stop f}` for each component [[start!]] started that is still running."
           :private true}
  started-components
  (atom {}))

;; A component keeps the place of its first start, so one restarted after its dependents still halts after them.
(defonce ^{:doc "Component keys in the order [[start!]] first started them."
           :private true}
  start-order
  (atom []))

(defonce ^{:doc "The keys of the components whose stop function is running."
           :private true}
  stopping
  (atom #{}))

;; One atom, so a start's check that no halt has begun and its mark as in flight are a single step, and a halt that
;; sets `:halted?` sees every start that passed the check.
(defonce ^{:doc "Whether [[halt!]] has run, so components may no longer start, under `:halted?`, and the starts in
             flight under `:starting`, as component key -> `{:thread t, :handle h}`, from their check until they
             register or fail."
           :private true}
  admissions
  (atom {:halted? false, :starting {}}))

(defn- handle-key
  [^ComponentHandle handle]
  (.-k handle))

(defn- bound-here?
  "Whether this thread has a binding of the component behind `handle`."
  [handle]
  (contains? *bound-boxes* (handle-key handle)))

(defn- admit!
  "Mark the start of `handle` under `k` as in flight on this thread.
  Throws if a halt has begun, or if this thread is already starting `k`."
  [k handle]
  (swap! admissions
         (fn [{:keys [halted? starting] :as state}]
           (cond
             halted?
             (throw (ex-info (str "The system has halted, so a component cannot start: " k) {:component k}))

             (= (Thread/currentThread) (get-in starting [k :thread]))
             (throw (ex-info (str "Starting component started itself: " k) {:component k}))

             :else
             (assoc-in state [:starting k] {:thread (Thread/currentThread), :handle handle})))))

(defn- run-start
  "Call `start` for the component under `k` and return its value, which must not be nil.
  It runs with no bindings, so a root is made from roots even when the calling thread binds another component."
  [k start]
  (let [value (clojure.core/binding [*bound-boxes* {}]
                (start))]
    (when (nil? value)
      (throw (ex-info (str "Starting component returned nil: " k) {:component k})))
    value))

(defn start!
  "Like [[ensure-started!]], but returns `[value started?]`, where `started?` says whether this call did the start."
  [handle start stop]
  (if (bound-here? handle)
    [@handle false]
    (let [current @handle]
      (if (some? current)
        [current false]
        (mc/with-slot-lock handle
          (let [k       (handle-key handle)
                current @handle]
            (cond
              (some? current)
              [current false]

              (contains? @stopping k)
              (throw (ex-info (str "Component is stopping: " k) {:component k}))

              :else
              (do
                (admit! k handle)
                (try
                  (let [started (run-start k start)]
                    ;; Registered before the root is published, so the root is never visible unregistered, and
                    ;; anything that starts after seeing it, and so may depend on it, comes after it in
                    ;; [[start-order]]. Components `start` itself started come before it, for the same reason.
                    (swap! start-order (fn [ks] (cond-> ks (not (some #{k} ks)) (conj k))))
                    (swap! started-components assoc k {:handle handle, :stop stop})
                    (mc/reset! handle started)
                    [started true])
                  (finally
                    ;; only once registered, so a halt that finds nothing in flight finds this registered
                    (swap! admissions update :starting dissoc k)))))))))))

(defn ensure-started!
  "The value of the component behind `handle` as this thread sees it, starting the component first if it has none.
   Starting calls `start` with no arguments and with no bindings in place, which must return a non-nil value,
   installs that as the root, and records `stop`, a function of the value, for [[stop!]] and [[halt!]].
   Threads racing to start the component start it once, and `start` runs holding the component's slot lock.
   So `start` must not wait for another thread that writes this component.
   A thread that binds the component gets the bound value, nil included, and starts nothing.
   Throws if the component is being stopped, if `start` tries to start the component it is starting, or once
   [[halt!]] has begun, until [[reopen!]].
   The component's root must already be installed, usually as nil by [[mutable-component-handle]]."
  [handle start stop]
  (first (start! handle start stop)))

(defn stop!
  "Stop the component behind `handle` if [[start!]] started it.
   It is unregistered and its root set back to nil, and then the stop function recorded at start is called on the
   value the root held, which is the latest one, since a component may replace its own value as it runs.
   Returns true if there was a running component to stop.
   The stop function runs without the component's lock, so it can wait for threads that use the system.
   Any of them that tries to start this component meanwhile gets an exception.
   Leaves alone a component [[start!]] did not start, and any binding of the component on this thread."
  [handle]
  (let [k       (handle-key handle)
        stopped (mc/without-binding
                 handle
                 (fn []
                   (mc/with-slot-lock handle
                     (when-let [{:keys [stop]} (get @started-components k)]
                       (swap! started-components dissoc k)
                       (swap! stopping conj k)
                       {:stop stop, :value (first (mc/reset-vals! handle nil))}))))]
    (if stopped
      (try
        (when (some? (:value stopped))
          ((:stop stopped) (:value stopped)))
        (some? (:value stopped))
        (finally
          (swap! stopping disj k)))
      false)))

(defn- stop-all!
  "Call [[stop!]] on each of `handles` in order.
   A stop that throws does not prevent the rest.
   Once all have run, throws an ex-info whose `:failures` holds each component key with its exception, and whose
   cause is the first failure, with the others attached to it as suppressed exceptions."
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
      (let [cause (second (first failures))]
        ;; so a log of the one exception shows every failure's stack trace; the cause itself is skipped, since two stops
        ;; can throw the same exception and an exception cannot suppress itself
        (doseq [[_ e] (rest failures)
                :when (not (identical? e cause))]
          (.addSuppressed ^Throwable cause e))
        (throw (ex-info "Some components failed to stop"
                        {:failures failures}
                        cause))))))

(defn- dependency-graph
  "The graph of `dependencies`, a map from a component key to the keys of the components it uses.
   Throws if they form a cycle."
  [dependencies]
  (reduce-kv (fn [graph k uses]
               (reduce #(dep/depend %1 k %2) graph uses))
             (dep/graph)
             dependencies))

(defn- halt-order
  "The handles of the running components, in the order [[halt!]] stops them.
   Each comes before every component it uses in `graph`, directly or through components that are not running.
   Components with no such path between them come in the reverse of their first-start order."
  [graph]
  (let [running     @started-components
        position    (zipmap @start-order (range))
        ;; the running components and what they use, directly or not; a user that is not running holds nothing back
        relevant    (into (set (keys running)) (dep/transitive-dependencies-set graph (keys running)))
        ;; an object no component key can equal, used by every relevant component, so each is a node even when it
        ;; has no edges
        placeholder (Object.)
        sortable    (reduce (fn [g k]
                              (reduce #(dep/depend %1 k %2)
                                      (dep/depend g k placeholder)
                                      (dep/immediate-dependencies graph k)))
                            (dep/graph)
                            relevant)]
    ;; topo-sort lists users after what they use, and among components it is free to order, puts the one with the
    ;; greatest position last
    (keep #(get-in running [% :handle])
          (reverse (dep/topo-sort #(compare (position %1 -1) (position %2 -1)) sortable)))))

(defn- close-admission!
  "Refuse every later start."
  []
  (swap! admissions assoc :halted? true)
  nil)

(defn- await-starts!
  "Wait for every start in flight to register or fail, by taking its component's slot lock, which the start holds
  throughout.
  Called after [[close-admission!]], when no more starts can be admitted, so none is missed."
  []
  (doseq [{:keys [handle]} (vals (:starting @admissions))]
    (mc/without-binding handle #(mc/with-slot-lock handle nil))))

(defn- begin-halt!
  "Refuse every later start, then wait for the starts already in flight to register or fail.
  Throws, before refusing anything, if called from a component's start, whose own start it could not wait for."
  []
  (when (some #(= (Thread/currentThread) (:thread %)) (vals (:starting @admissions)))
    (throw (ex-info "A component's start cannot halt the system" {})))
  (close-admission!)
  (await-starts!))

(defn halt!
  "Stop every running component [[start!]] started.
   The `dependencies` map takes a component key to the keys of the components it uses, and defaults to empty.
   A component stops before everything it uses, directly or through other components, even one that started later.
   Components with no such path between them stop in the reverse of the order they first started in.
   Throws before stopping anything if `dependencies` has a cycle, or if called from a component's start.
   From the moment it begins, every start throws until [[reopen!]], so nothing a stopping component starts again is
   left running.
   It waits for the starts already running, so it stops those too, and holds no lock while it waits.
   Throws after trying them all if any stop threw; see [[stop-all!]]."
  ([]
   (halt! {}))
  ([dependencies]
   (let [graph (dependency-graph dependencies)]
     (begin-halt!)
     (stop-all! (halt-order graph)))))

(defn reopen!
  "Let components start again after [[halt!]], for a REPL that halts the system and starts it again in one JVM."
  []
  (swap! admissions assoc :halted? false)
  nil)

;;; -------------------------------------------- Derived components --------------------------------------------

(def ^:private max-derived-values
  "How many dependency values a derived component remembers a value for. The most recently made value is kept first,
  and the oldest goes once there are more."
  8)

(defn- derived-lookup
  "The value in `entries` made for dependency values identical, one by one, to `deps`, or `::none`."
  [entries deps]
  (or (some (fn [[entry-deps value]]
              (when (every? true? (map identical? entry-deps deps))
                value))
            entries)
      ::none))

(deftype DerivedHandle [k dep-handles make entries]
  IDeref
  (deref [_]
    (let [deps  (mapv deref dep-handles)
          found (derived-lookup @entries deps)]
      (if (not= ::none found)
        found
        (derived-lookup (swap! entries (fn [es]
                                         (if (not= ::none (derived-lookup es deps))
                                           es
                                           (into [[deps (apply make deps)]] (take (dec max-derived-values)) es))))
                        deps)))))

(defmethod print-method DerivedHandle
  [^DerivedHandle handle ^Writer w]
  (.write w (str "#<DerivedHandle " (pr-str (.-k handle)) ">")))

(defmethod pprint/simple-dispatch DerivedHandle
  [handle]
  (print-method handle *out*))

(defn derived-component-handle
  "Make a read-only handle for a component made from the values of other components.
   Dereferencing it reads each of `dep-handles` as this thread sees them, and returns the value `make` returned for
   those values, calling `(make dep-value ...)` the first time this combination is seen.
   Values are told apart by identity, so a binding of a dependency, or a write that replaces its value, gets a
   fresh derived value, and the derived value follows bindings of its dependencies with no binding of its own.
   Only the last few combinations are remembered, so `make` must build something that is safe to rebuild, such as a
   cache, and it can run more than once for the same values when threads race, keeping one result."
  [k dep-handles make]
  (DerivedHandle. k (vec dep-handles) make (atom [])))
