(ns macos-release.download-jar
  (:require [macos-release.common :as c]
            [metabuild-common.core :as u]))

(defn- uberjar-url []
  (format "https://downloads.metabase.com/v%s/metabase.jar" (c/version)))

(def ^:private uberjar-dest-location
  (u/filename c/root-directory "OSX" "Resources" "metabase.jar"))

(defn download-jar!
  "Download the uberjar for the version of the Mac App we're building."
  []
  (u/step (format "Download JAR for version %s" (c/version))
    (u/download-file! (uberjar-url) uberjar-dest-location)))
