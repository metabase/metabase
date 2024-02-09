(ns metabase.test.util.dynamic-redefs
  (:require [medley.core :as m])
  (:import (clojure.lang Var)))

(set! *warn-on-reflection* true)

(def ^:dynamic *local-redefs*
  "A thread-local mapping from vars to their most recently bound definition."
  {})

(defn- get-local-definition
  "Ge, or return the unpatched "
  [a-var]
  (get *local-redefs* a-var
       (get (meta a-var) ::original)))

(defn- var->proxy
  "Build the proxy function which intercepts the given var. This proxy will call the local definition instead."
  [a-var]
  (fn [& args]
    (let [current-f (get-local-definition a-var)]
      (apply current-f args))))

(defn patch-vars!
  "Make sure the given vars have been patched, and then call the given thunk."
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
  "A thread-safe version of with-redefs. It only support functions, and adds a fair amount of overhead.
   It works by replacing each original definition with a proxy the first time it is redefined.
   This proxy uses a dynamic mapping to check whether the function is currently redefined."
  [bindings & body]
  (let [var->definition (bindings->var->definition bindings)]
    `(do
       (patch-vars! ~(vec (keys var->definition)))
       (binding [*local-redefs* (merge *local-redefs* ~var->definition)]
         ~@body))))
