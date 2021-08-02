(ns build-drivers.copy-source-files
  (:require [build-drivers.common :as c]
            [clojure.tools.build.api :as build]
            [metabuild-common.core :as u]))

(defn copy-source-files! [driver edition]
  (u/step (format "Copy %s source files" driver)
    (let [start-time-ms (System/currentTimeMillis)
          dirs          (for [path (:paths (c/driver-edn driver edition))]
                          (u/filename (c/driver-project-dir driver) path))]
      (u/announce "Copying files in %s" (pr-str dirs))
      (build/copy-dir
       {:src-dirs   dirs
        :target-dir (c/compiled-source-target-dir driver)})
      (u/announce "Copied files in %d directories in %d ms."
                  (count dirs)
                  (- (System/currentTimeMillis) start-time-ms)))))
