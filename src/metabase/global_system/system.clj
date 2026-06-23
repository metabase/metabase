(ns metabase.global-system.system
  (:require
   [metabase.global-system.mutable-component :as mc])
  (:import (clojure.lang IDeref Var)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "The system" :dynamic true :private true} *system*
  (atom {}))

(defrecord ComponentHandle [k]
  IDeref
  (deref [_] (get @*system* k))

  mc/MutableComponentHandle
  (root [_] (get @(.getRawRoot ^Var #'*system*) k))
  (binding [_ new-value thunk]
    (clojure.core/binding [*system* (atom (assoc @*system* k new-value))]
      (thunk)))
  (reset! [_ new-value]
    (clojure.core/swap! *system* assoc k new-value))
  (swap!* [_ f args]
    (clojure.core/swap! *system*
                        (fn swap!* [old-system]
                          (apply update old-system k f args))))
  (alter-root [_ new-value]
    (alter-var-root #'*system*
                    (fn alter-root* [old-system-atom]
                      (atom (assoc @old-system-atom k new-value))))))

(defn mutable-component-handle
  "Make a component handle with state stored under a key in the global *system* map."
  [k]
  (->ComponentHandle k))
