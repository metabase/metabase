(ns mage.test-running
  (:require [babashka.fs :as fs]
            [clojure.java.io :as io]
            [clojure.string :as str]
            [mage.util :as u]
            [mage.util :as util]))

(def project-root (or (first *command-line-args*) "."))

(defn- find-test-files
  "Recursively find all Clojure test files in the project"
  [dir]
  (->> (io/file dir)
       file-seq
       (filter #(.isFile %))
       (filter #(or (str/ends-with? (.getName %) "_test.clj")
                    (str/ends-with? (.getName %) "_test.cljc")))
       (map #(.getPath %))))

(defn- extract-namespace
  "Extract namespace from file content"
  [content]
  (when-let [match (re-find #"\(ns\s+([\w\.\-]+)" content)]
    (second match)))

(defn- extract-deftests
  "Extract all deftest names from file content"
  [content]
  (->> content
       (re-seq #"\(deftest\s+([\w\-\+\*\?\!]+)")
       (map second)))

(defn- process-file
  "Process a single test file and return fully qualified test names"
  [file-path]
  (try
    (let [content (slurp file-path)
          namespace (extract-namespace content)
          tests (extract-deftests content)]
      (when (and namespace (seq tests))
        (map #(str namespace "/" %) tests)))
    (catch Exception e
      (binding [*out* *err*]
        (println "Error processing" file-path ":" (.getMessage e)))
      nil)))

(defn find-all-deftests
  "Find all deftest vars in the project"
  [root-dir]
  (->> (find-test-files root-dir)
       (mapcat process-file)
       (filter some?)
       sort))

;; run-tests
;;   {:doc        "Run a test (or a single test) against nrepl server"
;;    :requires   [[clojure.string :as str]
;;                 [mage.be-dev :refer [nrepl-eval]]]
;;    :arg-schema [:tuple [:string {:name "NS/TEST" :desc "or just NS"}]]
;;    :options    [["-p" "--port PORT" "Port to use for the task, defaults to value in .nrepl-port"]]
;;    :task       (let [{:keys  [options]
;;                       [test] :arguments} (cli/parse! (current-task))
;;                      test                (if (or (str/starts-with? test "test/")
;;                                                  (str/starts-with? test "enterprise/"))
;;                                            ;; paths should come in as strings
;;                                            (format "\"%s\"" test)
;;                                            ;; ns or var should be a symbol
;;                                            (str "'" test))
;;                      code (format
;;                            "(do ((requiring-resolve 'dev.reload/reload!))
;;                                  (find-and-run-tests-repl {:only %s}))"
;;                            test)]
;;                  (nrepl-eval "mb.hawk.core" (str code) (:port options)))}

(defn dirs-with-clj-tests []
  (->> "**/*test*.clj"
       (fs/glob u/project-root-directory)
       (mapv (comp str fs/parent))
       (remove #(str/includes? % "mage"))
       distinct))
