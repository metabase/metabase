(ns release.common
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.core :as u])
  (:import java.io.File))

(assert (str/ends-with? (env/env :user-dir) "/bin/release")
        "Please run release.clj from the `release` directory e.g. `cd bin/release; clojure -m release`")

(def cloudfront-distribution-id "E35CJLWZIZVG7K")

(def ^String root-directory
  "e.g. /Users/cam/metabase"
  (.. (File. ^String (env/env :user-dir)) getParentFile getParent))

(def ^String uberjar-path
  (u/filename root-directory "target" "uberjar" "metabase.jar"))

(defonce ^:private build-options
  (atom nil))

(defn- build-option-or-throw [k]
  (or (get @build-options k)
      (let [msg (format "%s is not set. Run release.set-build-options/prompt-and-set-build-options! to set it."
                        (name k))
            e   (ex-info msg {})]
        (when-not (u/interactive?)
          (throw e))
        (u/error msg)
        (if (u/yes-or-no-prompt "Would you like to run this right now?")
          (do
            ((requiring-resolve 'release.set-build-options/prompt-and-set-build-options!))
            (build-option-or-throw k))
          (throw e)))))

(defn version
  "Version tag we are currently building, e.g. `0.36.0`"
  []
  (build-option-or-throw :version))

(defn set-version! [new-version]
  ;; strip off initial `v` if present
  (swap! build-options assoc :version (str/replace new-version #"^v" "")))

(defn branch
  "Branch we are building from, e.g. `release-0.36.x`"
  []
  (build-option-or-throw :branch))

(defn set-branch! [new-branch]
  (swap! build-options assoc :branch new-branch))

(defn edition
  "Either `:ce` (Community Edition) or `:ee` (Enterprise Edition)."
  []
  (build-option-or-throw :edition))

(defn set-edition! [new-edition]
  (assert (#{:ce :ee} new-edition))
  (swap! build-options assoc :edition new-edition))

(defn pre-release-version?
  "Whether this version should be considered a prerelease. True if the version doesn't follow the usual
  `major.minor.patch[.build]` format."
  []
  (not (re-matches #"^\d+\.\d+\.\d+(?:\.\d+)?$" (version))))

(defn patch-version?
  "Is the version we're building a patch release? True for versions that end in things like `.1` (non-zero patch
  number)"
  []
  (if-let [[_ patch] (re-matches #"^\d+\.\d+\.(\d+).*$" (version))]
    (not (zero? (Integer/parseUnsignedInt patch)))
    false))

(defn docker-image-name []
  (case (edition)
    :ce "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn downloads-url []
  (case (edition)
    :ce "downloads.metabase.com"
    :ee "downloads.metabase.com/enterprise"))

(defn artifact-download-url
  "Public-facing URL where you can download the artifact after it has been uploaded."
  (^String [filename]
   (artifact-download-url (version) filename))

  (^String [version filename]
   (format "https://%s/%s/%s"
           (downloads-url)
           (if (= version "latest") "latest" (str "v" version))
           filename)))

(defn website-repo []
  (case (edition)
    :ce "metabase/metabase.github.io"
    nil))

(defn heroku-buildpack-repo []
  (case (edition)
    :ce "metabase/metabase-buildpack"
    nil))

(defn metabase-repo
  "Metabase GitHub repo"
  []
  "metabase/metabase")

(defn docker-tag
  "The complete image name + tag e.g. \"metabase/metabase:v0.37.0\""
  []
  (format "%s:v%s" (docker-image-name) (version)))

(defn s3-artifact-path
  "S3 path excluding the protocol and bucket e.g. `/enterprise/v1.37.0.2/metabase.jar`"
  ([filename]
   (s3-artifact-path (version) filename))

  ([version filename]
   (str
    (when (= (edition) :ee)
      "/enterprise")
    (format "/%s/%s"
            (if (= version "latest") "latest" (str "v" version))
            filename))))

(defn s3-artifact-url
  "S3 path including protocol and bucket e.g. `s3://downloads.metabase.com/enterprise/v1.37.0.2/metabase.jar`"
  ([filename]
   (s3-artifact-url (version) filename))

  ([version filename]
   (s3-artifact-url "downloads.metabase.com" version filename))

  ([s3-bucket version filename]
   (format "s3://%s%s" s3-bucket (s3-artifact-path version filename))))
