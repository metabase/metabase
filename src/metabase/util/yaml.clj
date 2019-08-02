(ns metabase.util.yaml
  (:refer-clojure
   :exclude
   [load])
  (:require [clojure.tools.logging :as log]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [yaml.core :as yaml])
  (:import java.nio.file.Path))

(defn load
  "Load YAML at path `f`, parse it, and (optionally) pass the result to `constructor` fn."
  ([f] (load identity f))
  ([constructor ^Path f]
   (try
     (->> f
          .toUri
          slurp
          yaml/parse-string
          constructor)
     (catch Exception e
       (log/error (trs "Error parsing {0}:\n{1}"
                       (.getFileName f)
                       (or (some-> e
                                   ex-data
                                   (select-keys [:error :value])
                                   u/pprint-to-str)
                           e)))
       (throw e)))))
