#!/usr/bin/env bb
(ns mage.fzf-preview
  (:require [babashka.fs :as fs]
            [babashka.process :as p]
            [clojure.string :as str]
            [mage.util :as u]))

(defn preview-file [file-path]
  (->> (if (u/can-run? "bat")
         ["bat" "--color=always" "--style=numbers" file-path]
         ["cat" file-path])
       (apply p/shell)))

(defn preview-dir [dir-path]
  (->> (if (u/can-run? "tree")
         ["tree" "-L" "2" "-C" "--dirsfirst" dir-path]
         ["ls" "--color=auto" dir-path])
       (apply p/shell)))

(defn -main [& args]
  (let [file-or-dir (first args)]
    (if (fs/directory? file-or-dir)
      (preview-dir file-or-dir)
      (preview-file file-or-dir))))

(try
  (apply -main *command-line-args*)
  (catch Exception _ (println "Error in test_fzf_preview.clj, args:" *command-line-args*)))
