(ns release.common
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.core :as u])
  (:import java.io.File))

(assert (str/ends-with? (env/env :user-dir) "/bin/release")
        "Please run release.clj from the `release` directory e.g. `cd bin/release; clojure -m release`")

(def ^String root-directory
  "e.g. /Users/cam/metabase"
  (.. (File. (env/env :user-dir)) getParentFile getParent))

(def ^String uberjar-path
  (str root-directory "/target/uberjar/metabase.jar"))

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
          ((requiring-resolve 'release.set-build-options/prompt-and-set-build-options!))
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

(defn docker-repo []
  (case (edition)
    :ce "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn downloads-url []
  (case (edition)
    :ce "downloads.metabase.com"
    :ee "downloads.metabase.com/enterprise"))

(defn artifact-download-url
  "Public-facing URL where you can download the artifact after it has been uploaded."
  ([filename]
   (artifact-download-url (version) filename))

  ([version filename]
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

(defn metabase-repo []
  (case (edition)
    :ce "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn docker-tag []
  (format "%s:v%s" (docker-repo) (version)))
