(ns verify-driver
  (:require
   [build-drivers.verify :as verify]
   [metabuild-common.core :as u]))

(defn verify-driver
  "Verify that a driver JAR looks correct."
  [{:keys [driver]}]
  (u/exit-when-finished-nonzero-on-exception
    (when-not driver
      (throw (ex-info "Usage: clojure -X:build:build/verify-driver :driver <driver>" {})))
    (verify/verify-driver (u/parse-as-keyword driver))))
