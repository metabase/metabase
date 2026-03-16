(ns mage.cursive-resolve-as
  (:require [clojure.edn :as edn]
            [clojure.string :as str]))

(defn clj-kondo-lint-as->cursive-resolve-as
  [lint-as]
  (str/join \newline
            (reduce concat
                    []
                    [["<application>" "  <component name=\"ClojureResolveSettings\">"]
                     (for [[left right] lint-as]
                       (format "    <item key=\"%s\" resolves-as=\"%s\" />" left right))
                     ["  </component>" "</application>"]])))

(defn do-it
  []
  (println (clj-kondo-lint-as->cursive-resolve-as
            (:lint-as (edn/read-string (slurp ".clj-kondo/config.edn"))))))


