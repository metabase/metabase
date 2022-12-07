(ns hooks.metabase.models.disallow-invoking-model
  (:require [clj-kondo.hooks-api :as hooks]))

(defn hook [{:keys [node]}]
  (let [name (str (first (:children node)))]
    (hooks/reg-finding!
     (assoc (meta node)
            :message (format "Don't invoke %s as a function!" name)
            :type :metabase/disallow-invoking-model))))
