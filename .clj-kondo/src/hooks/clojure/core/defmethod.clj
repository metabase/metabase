(ns hooks.clojure.core.defmethod
  (:require
   [hooks.honey-sql]))

(defn lint-defmethod
  "Hook for `clojure.core/defmethod`."
  [{:keys [node], :as x}]
  (hooks.honey-sql/lint-in-subquery node)
  x)
