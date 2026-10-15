(ns metabase-enterprise.library-branching.registry
  "The schema registry of the namespaces that also load in babashka: the format reader, the kind codecs, the snapshot
  schemas and the engine. On the JVM it is the Metabase registry. Babashka cannot load that registry, so there it is
  a registry of its own."
  (:refer-clojure :exclude [def])
  (:require
   #?@(:bb      [[malli.core :as mc]
                 [malli.registry]]
       :default [[metabase.util.malli.registry :as mr]]))
  #?(:cljs (:require-macros [metabase-enterprise.library-branching.registry])))

#?(:bb
   (do
     (defonce ^:private registry* (atom (mc/default-schemas)))
     (malli.registry/set-default-registry! (malli.registry/mutable-registry registry*))))

(defn register!
  "Registers `schema` under the keyword `k`, with the description `doc` when given."
  ([k schema]
   #?(:bb      (swap! registry* assoc k schema)
      :default (mr/register! k schema))
   nil)
  ([k doc schema]
   (register! k #?(:bb schema :default (mr/-with-doc schema doc)))))

(defmacro def
  "Registers a schema: `(def ::k schema)` or `(def ::k docstring schema)`."
  ([k schema]
   `(register! ~k ~schema))
  ([k doc schema]
   `(register! ~k ~doc ~schema)))

(defn validate
  "True iff `x` fits `schema`."
  [schema x]
  #?(:bb      (mc/validate schema x)
     :default (mr/validate schema x)))

(defn explain
  "The explanation of why `x` does not fit `schema`, or nil when it fits."
  [schema x]
  #?(:bb      (mc/explain schema x)
     :default (mr/explain schema x)))
