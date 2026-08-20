(ns build-driver
  (:require
   [build-drivers.build-driver :as bd]
   [metabuild-common.core :as u]))

(defn build-driver
  "Entrypoint for `bin/build-driver.sh`. Builds a single driver, if needed."
  [{:keys [driver edition]}]
  (u/exit-when-finished-nonzero-on-exception
    (when-not driver
      (throw (ex-info "Usage: clojure -X:build:drivers:build/driver :driver <driver> [:edition <edition>]"
                      {})))
    (bd/build-driver! (u/parse-as-keyword driver) (or (u/parse-as-keyword edition) :oss))))
