(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [babashka.fs :as fs]
   [cheshire.core :as json]
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

(defn latest-patch-version
  "Gets something like '53', returns major + minor version, like '53.10'"
  [major-version]
  (let [base-url "https://api.github.com/repos/metabase/metabase/releases"
        per-page 100
        re-pattern (re-pattern (str "^v\\d\\.(" major-version "\\.\\d+)"))]
    (loop [page 1]
      (println (str "Looking for latest version of " major-version " on release page " page))
      (let [releases (json/parse-string
                      (:body (curl/get base-url
                                       {:headers {"Accept" "application/vnd.github.v3+json"}
                                        :query-params {:page page :per_page per-page}}))
                      keyword)
            match (some #(second (re-matches re-pattern (:tag_name %))) releases)]
        (cond
          match (do
                  (println (str (c/green "Found latest version of " major-version) ": " (c/cyan match)))
                  (str/replace match #"v" ""))
          (empty? releases) nil
          :else (recur (inc page)))))))

(defn find-latest-version [version]
  (cond
    (re-matches #"\d+" version) (str "1." (latest-patch-version version))
    (re-matches #"\d+\.\d+\.\d+" version) version
    :else (throw (ex-info (str "Invalid version format:" version)
                          {:version version}))))

(defn- download-jar! [version dir]
  (let [latest-version (find-latest-version version)]
    (when (fs/delete-if-exists (dir->file latest-version dir))
      ;; TODO: keep it?
      (println "Found and deleted old jar."))
    (when-not (.exists (io/file dir))
      (println (c/blue "Creating directory " dir " ..."))
      (fs/create-dirs dir)
      (println (c/green "Created.\n")))
    (try
      (println (str "Downloading from: " (url latest-version)
                    "\n              to: " (dir->file latest-version dir) " ..."))
      (download latest-version dir)
      (println (str "Downloaded " latest-version ".jar to " dir))
      (catch Exception e
        (println (str "Error downloading version " latest-version ". Do both the directory and version exist?"))
        (pst e)))))

(defn- without-slash [s] (str/replace s #"/$" ""))

(defn jar-download
  "Download a specific version of Metabase to a directory."
  [[version dir]]
  (let [dir (some-> (or dir (u/env "JARS") (str u/project-root-directory "/jars")) without-slash)]
    (download-jar! version dir)))
