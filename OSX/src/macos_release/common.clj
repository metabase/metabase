(ns macos-release.common
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.core :as u]
            [potemkin :as p])
  (:import java.io.File))

(comment u/keep-me)

(set! *warn-on-reflection* true)

(p/import-vars
 [u
  announce
  assert-file-exists
  copy-file!
  create-directory-unless-exists!
  delete-file!
  safe-println
  sh
  sh*
  step])

(def ^String macos-source-dir
  "e.g. /Users/cam/metabase/OSX"
  (env/env :user-dir))

(assert (str/ends-with? macos-source-dir "/OSX")
  "Please switch to the /OSX directory before running macos_release.clj")

(def ^String root-directory
  "e.g. /Users/cam/metabase"
  (.getParent (File. macos-source-dir)))

(def ^String artifacts-directory
  "e.g. /Users/cam/metabase/osx-artifacts"
  (str root-directory "/osx-artifacts"))

(defn exists? [^String filename]
  (when filename
    (.exists (File. filename))))

(defn artifact
  "Return the full path of a file in the build artifacts directory."
  ^String [filename]
  (when-not (u/file-exists? artifacts-directory)
    (create-directory-unless-exists! artifacts-directory))
  (str artifacts-directory "/" filename))

(defn- version* []
  (let [[out]       (sh "git" "describe" "--abbrev=0" "--tags")
        [_ version] (re-find #"^v([\d.]+)" out)]
    (when-not (seq version)
      (throw (ex-info "Error parsing version." {:out out})))
    version))

(def ^{:arglists '([])} version
  "Currently tagged Metabase version. e.g. `0.34.3`"
  (partial deref (delay (version*))))

(defn uploaded-artifact-url [artifact]
  (format "https://downloads.metabase.com/v%s/%s" (version) artifact))
