(ns metabase.test.util.dynamic-redefs
  (:require [medley.core :as m]
            [metabase.util.log :as log])
  (:import (clojure.lang Var)))

(set! *warn-on-reflection* true)

(def ^:dynamic *local-redefs*
  "A thread-local mapping from vars to their most recently bound definition."
  {})

(defn dynamic-value
  "Get the value of this var that is in scope. It is the unpatched version if there is no override."
  [a-var]
  (get *local-redefs* a-var
       (get (meta a-var) ::original)))

(def ^:dynamic *already-called* #{})

(def infinite-loop-error
  "Infinite loop detected in `dynamic-redefs`. If you're trying to call the original,
  non-rebound, function, see `metabase.test.util-test/with-dynamic-redefs-nested-binding-test`
  for an example.

  Specifically, instead of
  ```
  (let [orig the-original-fn]
   (with-dynamic-redefs [the-original-fn (fn [...]
                                          (something-else)
                                          (orig ...))]
     ...))
  ```

  You probably want:
  ```
  (with-dynamic-redefs [the-original-fn (fn [...]
                                         (something-else)
                                         ((dynamic-value the-original-fn) ...))])
  ```")

(defn- var->proxy
  "Build a proxy function to intercept the given var. The proxy checks the current scope for what to call."
  [a-var]
  (fn [& args]
    (let [current-f (dynamic-value a-var)]
      (when (contains? *already-called* a-var)
        ;; Log it as well as throwing it - this gives more user-friendly formatting.
        (log/error infinite-loop-error)
        (throw (ex-info infinite-loop-error {:var a-var})))
      (binding [*already-called* (conj *already-called*)]
        (apply current-f args)))))

(defn patch-vars!
  "Rebind the given vars with proxies that wrap the original functions."
  [vars]
  (let [unpatched-vars (remove #(::patched? (meta %)) vars)]
    (doseq [^Var a-var unpatched-vars]
      (locking a-var
        (when-not (::patched? (meta a-var))
          (let [old-val (.getRawRoot a-var)
                patch-meta #(assoc % ::original old-val ::patched? true)]
            (.bindRoot a-var (with-meta (var->proxy a-var)
                                        (patch-meta (meta (get *local-redefs* a-var)))))
            (alter-meta! a-var patch-meta)))))))

(defn- sym->var [sym] `(var ~sym))

(defn- bindings->var->definition
  "Given a with-redefs style binding, return a mapping from each corresponding var to its given replacement."
  [binding]
  (m/map-keys sym->var (into {} (partition-all 2) binding)))

(defmacro with-dynamic-redefs
  "A thread-safe version of with-redefs. It only supports functions, and adds a fair amount of overhead.
   It works by replacing each original definition with a proxy the first time it is redefined.
   This proxy uses a dynamic mapping to check whether the function is currently redefined."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (merge *local-redefs* ~var->definition)]
         ~@body))))
