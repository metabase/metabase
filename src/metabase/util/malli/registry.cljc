(ns metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [malli.core :as mc]
   [malli.registry :as mr]
   [malli.util :as mut]
   #?@(:clj ([malli.experimental.time :as malli.time])))
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               (mut/schemas)
               #?(:clj (malli.time/schemas)))))

(defonce ^:private registry (mr/mutable-registry registry*))

(mr/set-default-registry! registry)

(defn register!
  "Register a spec with our Malli spec "
  [type schema]
  (swap! registry* assoc type schema)
  nil)

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     [type schema]
     `(register! ~type ~schema)))
