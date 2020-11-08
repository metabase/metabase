(ns release.uberjar
  "Code related to building, pushing, and validating metabase.jar"
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.core :as u]
            [release.common :as c]
            [release.common
             [hash :as hash]
             [http :as common.http]
             [upload :as upload]]))

(def ^:private bin-version-file
  (str c/root-directory "/bin/version"))

(defn- update-version-info! []
  (u/step (format "Update %s if needed" (u/assert-file-exists bin-version-file))
    (u/step "Update version in bin/version"
      (let [lines         (str/split-lines (slurp bin-version-file))
            updated-lines (for [line lines]
                            (if (re-matches #".*VERSION=.*" line)
                              (format "VERSION='v%s'" (c/version))
                              line))]
        (if (= lines updated-lines)
          (u/announce "Correct version is already set.")
          (do
            (u/announce "Version set to 'v%s'" (c/version))
            (spit bin-version-file (str/join (interleave updated-lines (repeat "\n"))))
            (u/sh "chmod" "+x" bin-version-file)
            (u/step "Commit updated bin/version"
              (u/sh "git" "add" bin-version-file)
              (u/sh "git" "commit" "-m" (str \v (c/version)) bin-version-file))))))))

(defn build-uberjar! []
  (update-version-info!)
  (u/step "Run bin/build to build uberjar"
    (u/delete-file! (str c/root-directory "/target"))
    (u/sh {:dir c/root-directory
           :env (merge {"JAVA_HOME" (env/env :java-home)
                        "PATH"      (env/env :path)
                        "HOME"      (env/env :user-home)}
                       (when (= (c/edition) :ee)
                         {"MB_EDITION" "ee"}))}
          "bin/build")
    (u/step "Verify uberjar exists"
      (u/assert-file-exists c/uberjar-path))))

(defn- validate-uberjar []
  (u/step "Validate uberjar(s) on downloads.metabase.com"
    (doseq [url   [(c/artifact-download-url "metabase.jar")
                   (when (= (c/edition) :ee)
                     (c/artifact-download-url "latest" "metabase.jar"))]
            :when url]
      (u/step (format "Validate %s" url)
        (common.http/check-url-exists url)
        (u/step (format "Check hash of %s" url)
          (let [temp-location "/tmp/metabase.jar"]
            (u/delete-file! temp-location)
            (u/sh {:quiet? true} "wget" "--quiet" "--no-cache" "--output-document" temp-location url)
            (let [uberjar-hash (hash/sha-256-sum c/uberjar-path)
                  url-hash     (hash/sha-256-sum temp-location)]
              (u/announce "Hash of local metabase.jar is %s" uberjar-hash)
              (u/announce "Hash of %s is %s" url url-hash)
              (assert (= uberjar-hash url-hash)))))))))

(defn upload-uberjar! []
  (u/step "Upload uberjar and validate"
    (u/step (format "Upload uberjar to %s" (c/artifact-download-url "metabase.jar"))
      (upload/upload-artifact! c/uberjar-path "metabase.jar"))
    (when (= (c/edition) :ee)
      (u/step (format "Upload uberjar to %s" (c/artifact-download-url "latest" "metabase.jar"))
        (upload/upload-artifact! c/uberjar-path "latest" "metabase.jar")))
    (validate-uberjar)))
