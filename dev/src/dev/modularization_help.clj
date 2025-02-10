(ns src.dev.modularization-help
  (:require
   [clojure.string :as str]))

(defn potempkin-ns!
  "Call this inside a namespace to gather the public vars, sort them, and return them as a vector, usually this is
  exactly what you put into potempkin's `import-vars`."
  []
  (let [ns-symbol (symbol (str *ns*))]
    (into [(symbol (last (str/split (str ns-symbol) #"\.")))]
          (sort (keys (ns-publics ns-symbol))))))

(comment
  (potempkin-ns!))
