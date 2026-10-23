(ns build.help-assistant-docs
  "Bundle the Metabase docs into the uberjar for the Admin > Help assistant (`metabase.help-assistant.core`)."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(def ^:private source-dir (u/filename u/project-root-directory "docs"))

(def ^:private target-dir (u/filename u/project-root-directory "resources" "help_assistant" "docs"))

(defn- user-doc? [^String path]
  (and (str/ends-with? path ".md")
       ;; the developers guide is about contributing to Metabase, not using it
       (not (str/starts-with? path (u/filename source-dir "developers-guide" "")))))

(defn copy-docs!
  "Replace `resources/help_assistant/docs` with the Markdown pages in `docs/`, without the developers guide."
  []
  (u/step "Copy the docs for the Help assistant"
    (u/delete-file-if-exists! target-dir)
    (let [paths (u/find-files source-dir user-doc?)]
      (doseq [^String path paths
              :let [target (io/file target-dir (subs path (inc (count source-dir))))]]
        (io/make-parents target)
        (io/copy (io/file path) target))
      (u/announce "Copied %d doc pages to %s" (count paths) target-dir))))
