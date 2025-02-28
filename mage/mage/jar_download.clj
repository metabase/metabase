(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [clojure.java.io :as io]
   [clojure.repl :refer [pst]]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.io File]))

(set! *warn-on-reflection* true)

(defn- url [version]
  (str "https://downloads.metabase.com"
       (when (str/starts-with? version "1") "/enterprise")
       "/v"
       version "/metabase.jar"))

(defn- dir->file ^File [version dir]
  (io/file (str dir "/metabase_" version ".jar")))

(defn- download [version dir]
  (io/copy
   (:body (curl/get (url version) {:as :stream}))
   (dir->file version dir)))

(defn- download-jar! [version dir]
  (when (.exists (dir->file version dir))
    (println (c/blue "Found existing jar at " (dir->file version dir) " deleting it now."))
    (io/delete-file (dir->file version dir))
    (println (c/green "Deleted.\n")))
  (when-not (.exists (io/file dir))
    (println (c/blue "Creating directory " dir " ..."))
    (.mkdirs (io/file dir))
    (println (c/green "Created.\n")))
  (try
    (println (str "Downloading from: " (url version)
                  "\n              to: " (dir->file version dir) " ..."))
    (download version dir)
    (println (str "Downloaded " version ".jar to " dir))
    (catch Exception e
      (println (str "Error downloading version " version ". Do both the directory and version exist?"))
      (pst e))))

(defn- without-slash [s] (str/replace s #"/$" ""))

(defn usages [_]
  (println "Usage:")
  (println " ./bin/mage jar-download 0.42.2")
  (println " ./bin/mage jar-download 1.45.2")
  (println " ./bin/mage jar-download 1.45.2 ~/path/to/my/jars")
  (println "")
  (println "protip: This script will download into [[dir]], $JARS, or /path/to/metabase/jars."))

(defn jar-download
  "Download a specific version of Metabase to a directory."
  [[version dir]]
  (let [dir (some-> (or dir (u/env "JARS") (str u/project-root-directory "/jars")) without-slash)]
    (download-jar! version dir)))
