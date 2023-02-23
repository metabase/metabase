(ns metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [malli.core :as mc]
   [malli.registry :as mr]))

(defonce ^:private registry*
  (atom (mc/default-schemas)))

(defonce registry (mr/mutable-registry registry*))

(mr/set-default-registry! registry)

(defn register!
  [type schema]
  (swap! registry* assoc type schema)
  nil)

(defmacro def [type schema]
  `(register! ~type ~schema))
