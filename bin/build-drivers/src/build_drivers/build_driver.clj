(ns build-drivers.build-driver
  (:require [build-drivers.common :as c]
            [build-drivers.compile-source-files :as compile-source-files]
            [build-drivers.copy-source-files :as copy-source-files]
            [build-drivers.create-uberjar :as create-uberjar]
            [build-drivers.verify :as verify]
            [metabuild-common.core :as u]))

(defn clean! [driver]
  (u/step "Clean"
    (u/delete-file-if-exists! (c/compiled-source-target-dir driver))
    (u/delete-file-if-exists! (c/driver-jar-destination-path driver))))

(defn build-driver!
  [driver edition]
  (let [edition (or edition :oss)
        start-time-ms (System/currentTimeMillis)]
    (u/step (format "Build driver %s (edition = %s)" driver edition)
      (clean! driver)
      (copy-source-files/copy-source-files! driver edition)
      (compile-source-files/compile-clojure-source-files! driver edition)
      (create-uberjar/create-uberjar! driver edition)
      (u/announce "Built %s driver in %d ms." driver (- (System/currentTimeMillis) start-time-ms))
      (verify/verify-driver driver))))
