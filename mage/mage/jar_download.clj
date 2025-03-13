(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [babashka.fs :as fs]
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
  (when (fs/delete-if-exists (dir->file version dir))
    ;; TODO: keep it?
    (println "Found and deleted old jar."))
  (when-not (.exists (io/file dir))
    (println (c/blue "Creating directory " dir " ..."))
    (fs/create-dirs dir)
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

(defn jar-download
  "Download a specific version of Metabase to a directory."
  [[version dir]]
  (let [dir (some-> (or dir (u/env "JARS") (str u/project-root-directory "/jars")) without-slash)]
    (download-jar! version dir)))
