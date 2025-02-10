(ns src.dev.modularization-help
  (:require
   [clojure.string :as str]))

(defn potempkin-ns! []
  (let [ns-symbol (symbol (str *ns*))]
    (into [(symbol (last (str/split (str ns-symbol) #"\.")))]
          (sort (keys (ns-publics ns-symbol))))))

(comment
  (potempkin-ns!))
