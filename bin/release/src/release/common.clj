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

(defn github-milestone
  "Name of GitHub milestone to query for fixed issue descriptions. Same as version, except for enterprise edition, in
  which case the leading 0 is replaced by 1."
  []
  (build-option-or-throw :github-milestone))

(defn set-github-milestone! [new-github-milestone]
  (swap! build-options assoc :github-milestone new-github-milestone))

(defn branch
  "Branch we are building from, e.g. `release-0.36.x`"
  []
  (build-option-or-throw :branch))

(defn set-branch! [new-branch]
  (swap! build-options assoc :branch new-branch))

(defn edition
  "Either `:oss` (Community Edition) or `:ee` (Enterprise Edition)."
  []
  {:post [(#{:oss :ee} %)]}
  (build-option-or-throw :edition))

(defn set-edition! [new-edition]
  (assert (#{:oss :ee} new-edition))
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
    :oss "metabase/metabase"
    :ee "metabase/metabase-enterprise"))

(defn downloads-url []
  (case (edition)
    :oss "downloads.metabase.com"
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
    :oss "metabase/metabase.github.io"
    nil))

(defn heroku-buildpack-repo []
  (case (edition)
    :oss "metabase/metabase-buildpack"
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

(defn version-greater-than
  "Is version string `x` greater than version `y`?"
  [x y]
  {:pre [(string? x) (string? y)]}
  (letfn [(parts [s]
            (for [part (-> s (str/replace #"^v" "") (str/split  #"\."))]
              (Integer/parseUnsignedInt part)))]
    (loop [[x & x-more] (parts x) [y & y-more] (parts y)]
      (cond
        ((fnil > 0 0) x y) true
        ((fnil < 0 0) x y) false
        ((fnil = 0 0) x y) (if (or (seq x-more) (seq y-more))
                             (recur x-more y-more)
                             false)))))

(defn- recent-tags-from-github
  "Recent tags for the current edition from GitHub."
  []
  (->> ((requiring-resolve 'release.common.github/recent-tags))
       (filter (case (edition)
                 :ee  (partial re-matches #"v1(?:\.\d+){2,}$")
                 :oss (partial re-matches #"v0(?:\.\d+){2,}$")))))

(defn- most-recent-tag
  "Given a set of release `tags`, return the most recent one."
  [tags]
  (->> tags
       (sort-by identity (fn [x y]
                           (cond
                             (version-greater-than x y) -1
                             (version-greater-than y x) 1
                             :else                      0)))
       first))

(def ^{:arglists '([])} latest-version?
  "Is the version we're building going to be the new latest version for this edition?"
  (memoize
   (fn []
     (u/step (format "Check whether %s will be the latest version" (version))
       (let [latest-gh-tag (most-recent-tag (recent-tags-from-github))]
         (u/announce "Latest %s version from GitHub is %s" (edition) latest-gh-tag)
         (let [latest? (when-not (pre-release-version?)
                         (version-greater-than (version) latest-gh-tag))]
           (u/announce "%s %s be the new latest %s version." (version) (if latest? "will" "will NOT") (edition))
           latest?))))))
