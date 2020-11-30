(ns metabuild-common.java
  (:require [metabuild-common.core :as u]))

(defn java-version
  "Get `major.minor` version of the `java` command, e.g. `14.0` or `1.8` (Java 8)."
  []
  (when-let [[_ version] (re-find #"version \"(\d+\.\d+)\..*\"" (first (u/sh "java" "-version")))]
    (Double/parseDouble version)))

(defn check-java-8 []
  (u/step "Verify Java version is Java 8"
    (let [version (or (java-version)
                      (throw (Exception. "Unable to determine Java major version.")))]
      ;; TODO -- is it possible to invoke `jabba` or some other command programmatically, or prompt for a different
      ;; `JAVA_HOME`/`PATH` to use?
      (when-not (#{1.8 8} version)
        (throw (Exception. "The Metabase build script currently requires Java 8 to run. Please change your Java version and try again.")))
      (u/announce "Java version is Java 8."))))
