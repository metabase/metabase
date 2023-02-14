(ns metabase.domain-entities.malli
  (:refer-clojure :exclude [defn])
  (:require
    [malli.util :as mut]
    #?@(:clj  ([malli.core :as mc]
               [metabase.util.malli :as mu]
               [net.cgrand.macrovich :as macros])
        :cljs ([malli.instrument]
               [metabase.domain-entities.converters])))
  #?(:cljs (:require-macros [metabase.domain-entities.malli])))

;; Experimental JS->CLJS bridge
;; - Pass vanilla JS objects to functions written with a defn macro
;; - It wraps mu/defn and uses the Malli schemas to determine which arguments need conversion with `cljs-bean`.
;;   - Use recursive beaning, or something like it, for all Clojure-side access and usage.

;; I think this is the most practical and TS-native approach. Clojure is a lot more flexible, with macros and dynamic
;; typing, so it should be the one jumping through the hoops. Of course performance is a question but there's still
;; hope. We can assume (deep) immutability so there's lots of room for caching of eg. key conversion.

#?(:clj
   (clojure.core/defn- argname [arg]
     (cond
       (symbol? arg)   arg
       (and (map? arg)
            (:as arg)) (:as arg)
       :else           (gensym "arg"))))

#?(:clj
   (defmacro defn
     "Specialized [[clojure.core/defn]] for writing domain objects CLJC code.

     Malli schemas are *required* for the return type and arguments!

     In JVM Clojure, this is transparently [[mu/defn]].

     For CLJS, the argument schemas are used to determine how to wrap each vanilla JS
     argument for idiomatic use in CLJS. This is powered by the `cljs-bean` library.

     See `metabase.domain-entities.converters` for the details of how things get converted.
     In summary:
     - `[:map ...]` expects a JS object with `camelCase`, and gets wrapped as a CLJS map with
       `:kebab-case` keyword keys. Values are recursively converted.
     - `[:map-of ...]` is converted to a CLJS map, but the keys are left alone.
     - `[:vector ...]` expects a JS array, and converts it to a vector.
     - Use [[opaque]] to block conversion of (part of) a schema, if it's treated as opaque by the code."
     [sym _ return-schema docstring args & body]
     (macros/case
       ;; In Clojure, this is a straightforward clone of mu/defn.
       :clj  `(mu/defn ~sym :- ~return-schema ~docstring ~(vec args) ~@body)
       ;; In CLJS, we do fancy cljs-bean wrapping based on the schema.
       :cljs
       (let [argnames (map (comp argname first) (partition 3 args))]
         `(clojure.core/defn ~sym ~docstring [~@argnames]
            (metabase.domain-entities.converters/outgoing
              (let [~@(apply concat
                             (for [[sym [argspec _ schema]] (map vector argnames (partition 3 args))]
                               `[~argspec
                                 ((metabase.domain-entities.converters/incoming (malli.core/ast ~schema)) ~sym)]))]
              ~@body)))))))

(clojure.core/defn opaque
  "Marks a schema as `:bean/opaque true` so that it will be ignored by the converters."
  [schema]
  (mut/update-properties schema assoc :bean/opaque true))
