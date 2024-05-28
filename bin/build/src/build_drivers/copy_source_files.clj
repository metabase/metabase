(ns build-drivers.copy-source-files
  (:require
   [build-drivers.common :as c]
   [clojure.tools.build.api :as b]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn copy-source-files!
  "Copy source files into the build driver JAR."
  [driver edition]
  (u/step (format "Copy %s source files" driver)
    (let [start-time-ms (System/currentTimeMillis)
          dirs          (:paths (c/driver-edn driver edition))]
      (assert (every? u/absolute? dirs)
              (format "All dirs should be absolute, got: %s" (pr-str dirs)))
      (u/announce "Copying files in %s" (pr-str dirs))
      (b/copy-dir
       {:src-dirs   dirs
        :target-dir (c/compiled-source-target-dir driver)})
      (u/announce "Copied files in %d directories in %d ms."
                  (count dirs)
                  (- (System/currentTimeMillis) start-time-ms)))))
