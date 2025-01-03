(ns hooks.metabase.util
  (:require
   [clj-kondo.hooks-api :as api]
   [hooks.common]))

(defn format-color [{:keys [node], :as x}]
  (let [[_format-color _color format-string-node & args] (:children node)]
    (when (api/string-node? format-string-node)
      (let [expected-arg-count (hooks.common/format-string-specifier-count (api/sexpr format-string-node))
            actual-arg-count   (count args)]
        (when-not (= expected-arg-count actual-arg-count)
          (api/reg-finding! (assoc (meta node)
                                   :message (format "metabase.util/format-color format string expects %d arguments instead of %d."
                                                    expected-arg-count
                                                    actual-arg-count)
                                   :type :format))))))
  x)

(defn case-enum
  "Lint `(case-enum ...)` like `(condp = ...)`."
  [x]
  (letfn [(update-node [node]
            (let [[_case-enum x & more] (:children node)]
              (-> (api/list-node
                   (list*
                    (api/token-node 'clojure.core/condp)
                    (api/token-node 'clojure.core/=)
                    x
                    more))
                  (with-meta (meta node)))))]
    (update x :node update-node)))
