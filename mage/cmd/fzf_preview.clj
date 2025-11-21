#!/usr/bin/env bb
;; This file is meant to be called Through fzf, not directly!
(ns mage.fzf-preview
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(defn preview-file [file-path]
  (->> (if (u/can-run? "bat")
         ["bat" "--color=always" "--style=numbers" file-path]
         ["cat" file-path])
       (apply p/shell)))

(defn count-tests-in-file [file-content]
  (let [test-regex #"\(deftest"]
    (count (re-seq test-regex file-content))))

(defn- count-tests [dir-path]
  (let [files (map str (fs/glob dir-path "**/*_test.clj{,c,s}"))]
    (reduce + (pmap (comp count-tests-in-file slurp) files))))

(defn preview-dir [dir-path]
  (let [count-cmd ["fd" "--hidden" "--no-ignore" "." dir-path]
        count     (-> (p/shell count-cmd {:out :string})
                      :out
                      (str/split-lines)
                      count)

        test-count (count-tests dir-path)

        size-cmd  ["du" "-sh" dir-path]
        size      (-> (p/shell size-cmd {:out :string}) :out (str/trim))

        tree-cmd  (cond
                    (binding [u/*skip-warning* true]
                      (u/can-run? "tre"))
                    ["tre" "-c" "-l" "4" dir-path]
                    (binding [u/*skip-warning* true]
                      (u/can-run? "tree"))
                    ["tree" "-C" "-L" "4" dir-path]
                    :else
                    ["ls" "-l" "--color=auto" dir-path])

        tree-out  (:out (p/shell tree-cmd {:out :string}))]

    ;; Print nicely
    (println (str "📁 " dir-path))
    (println (c/green  "--------------------------------"))
    (println (c/green (format "Tests: %s" test-count)))
    (println (c/green (format "Files: %s" count)))
    (println (c/green (format "Size:  %s" size)))
    (println (c/green  "--------------------------------"))
    (println)
    (println "Tree:")
    (println tree-out)))

(defn -main [& args]
  (let [file-or-dir (first args)]
    (if (fs/regular-file? file-or-dir)
      (preview-file file-or-dir)
      (preview-dir file-or-dir))))

(try
  (apply -main *command-line-args*)
  (catch Exception e
    (println "Error in fzf_preview.clj, args:" *command-line-args*)
    (throw e)))
