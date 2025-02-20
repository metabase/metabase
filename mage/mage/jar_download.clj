(ns mage.jar-download
  (:require [babashka.curl :as curl]
            [clojure.java.io :as io]
            [clojure.repl :refer [pst]]
            [clojure.string :as str]
            [mage.util :as u]))

(defn url [version]
  (str "https://downloads.metabase.com"
       (when (str/starts-with? version "1") "/enterprise")
       "/v"
       version "/metabase.jar"))

(defn download [version dir]
  (io/copy
   (:body (curl/get (url version) {:as :stream}))
   (io/file (str dir "/metabase_" version ".jar"))))

(defn download-jar! [version dir]
  (try
    (println (str "Downloading from " (url version) " ..."))
    (download version dir)
    (println (str "Downloaded " version ".jar to " dir))
    (catch Exception e
      (println (str "Error downloading version " version ". Do both the directory and version exist?"))
      (pst e))))

(defn- without-slash [s] (str/replace s #"/$" ""))

(defn jar-download [[version dir]]
  (let [dir (some-> (or dir (u/env "JARS")) without-slash)]
    (if (or (nil? version) (nil? dir))
      (do (println "Usage: mb-download 0.42.2")
          (println "Usage: mb-download 1.45.2")
          (println "Usage: mb-download 1.45.2 ~/path/to/my/jars")
          (println "")
          (println "protip: this script will read from $JARS, and use that as your jar directory."))
      (download-jar! version dir))))
