(ns mage.db-schema
  (:require
   [clojure.pprint :as pprint]
   [mage.be-dev :as be-dev]
   [mage.color :as c])
  (:import (java.io StringWriter)))

(defn output [{[table-name] :arguments, {:keys [port]} :options}]
  (let [port   (or port
                   (slurp ".nrepl-port")
                   (do (println (c/red "No port specified, and no .nrepl-port file found."))
                       (System/exit 1)))
        ;; send internal print statements to nowhere
        output (binding [*out* (StringWriter.)]
                 (-> (be-dev/nrepl-eval "dev.db-schema" (format "(output %s)" (pr-str table-name)) port)
                     (get "value")
                     read-string
                     :value))]
    (pprint/pprint output)))
