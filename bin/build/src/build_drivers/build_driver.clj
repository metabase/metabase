(ns build-drivers.build-driver
  (:require
   [build-drivers.common :as c]
   [build-drivers.compile-source-files :as compile-source-files]
   [build-drivers.copy-source-files :as copy-source-files]
   [build-drivers.create-uberjar :as create-uberjar]
   [build-drivers.verify :as verify]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn- clean! [driver]
  (u/step "Clean"
    (u/delete-file-if-exists! (c/compiled-source-target-dir driver))
    (u/delete-file-if-exists! (c/driver-jar-destination-path driver))))

(defn build-driver!
  "Build a single driver, if needed.
  1-arity that takes just a map is meant for use directly with clojure -X."
  ([{:keys [driver edition], :as options}]
   (build-driver! driver edition (dissoc options :driver :edition)))

  ([driver edition]
   (build-driver! driver edition nil))

  ([driver edition {:keys [project-dir target-dir], :as options}]
   (let [edition       (or edition :oss)
         start-time-ms (System/currentTimeMillis)]
     (binding [c/*driver-project-dir* (or project-dir
                                          c/*driver-project-dir*)
               c/*target-directory*   (or target-dir
                                          c/*target-directory*)]
       (u/step (format "Build driver %s (edition = %s, options = %s)" driver edition (pr-str options))
         (clean! driver)
         (copy-source-files/copy-source-files! driver edition)
         (compile-source-files/compile-clojure-source-files! driver edition)
         (create-uberjar/create-uberjar! driver edition)
         (u/announce "Built %s driver in %d ms." driver (- (System/currentTimeMillis) start-time-ms))
         (verify/verify-driver driver))))))
