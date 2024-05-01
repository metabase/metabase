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
