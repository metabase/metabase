(ns mage.actions.filter-doc-branches
  (:require
   [clojure.string :as str]
   [mage.color :as c]))

(set! *warn-on-reflection* true)

(def ^:private release-regex #"release-x\.(\d+)\.x")

(defn- extract-release-num [release-branchname]
  (let [[_ num] (re-matches release-regex release-branchname)]
    (Integer/parseInt num)))

(defn- categorize-branchname [branchname]
  (cond
    (= branchname "master") [:master]
    (re-matches release-regex branchname) [:release (extract-release-num branchname)]
    (or
     (= branchname "doc-update-detection")
     (str/starts-with? branchname "docs-workflow-test-")) [:test branchname]))

(comment
  (categorize-branchname "release-x.49.x")
  ;; => [:release 49]

  (categorize-branchname "master")
  ;; => [:master]

  (categorize-branchname "docs-workflow-test-123")
  ;; => [:test "docs-workflow-test-123"]

  (categorize-branchname "any-other-branch")
  ;; => nil
  )
(defn- usage []
  (println "Usage: bb mage/mage/actions/filter_doc_branches.clj branchname")
  (System/exit 1))

(defn -main
  "This is called from the `Docs Bump Detected` workflow to filter out doc branches.

   Exits with 0 if the branchname is publishable or a tesdt branch, and 1 if it is not.

   If you need to run the docs workflow with some branch that gets filtered, then
   run it from: https://github.com/metabase/docs.metabase.github.io/actions/workflows/process_docs_changes.yml"
  [& args]
  (let [branchname (or (first args) (usage))
        _ (println "Checking if branchname " (c/green branchname) " should trigger a docs build")
        [category release-num] (categorize-branchname branchname)]
    (case category
      :master (println "Master branch detected.")
      :release (println "Release branch detected. Release number:" release-num)
      :test (println "Test branch detected. Branchname:" branchname)
      (do (println "Unpublishable branchname:" branchname)
          (System/exit 1)))
    (System/exit 0)))

(when (= *file* (System/getProperty "babashka.file"))
  (apply -main *command-line-args*))
