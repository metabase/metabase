(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [babashka.fs :as fs]
   [babashka.process :as p]
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

(defn- size-mb [bytes]
  (let [size (/ bytes 1024.0 1024.0)]
    (if (< size 1)
      (str (int (* size 1000)) " KB")
      (str (int size) " MB"))))

(defn- download-jar! [version dir delete?]
  (let [latest-version (find-latest-version version)]
    (when (and delete? (fs/exists? (dir->file latest-version dir)))
      (fs/delete (dir->file latest-version dir))
      (println (c/red "Found and deleted old jar.")))
    (when-not (fs/exists? (io/file dir))
      (println (c/blue "Creating directory " dir))
      (fs/create-dirs dir))
    (if (fs/exists? (dir->file latest-version dir))
      (println "Already downloaded" (c/green (url latest-version))
               ".jar to" (c/green (dir->file latest-version dir))
               ", size:" (c/red (size-mb (fs/size (dir->file latest-version dir)))))
      (try
        (println (str "Downloading from: " (url latest-version)
                      "\n              to: " (dir->file latest-version dir) " ..."))
        (u/with-throbber "Downloading... " (fn [] (download latest-version dir)))
        (println (str "Downloaded."))
        (catch Exception e
          (throw (ex-info (str "Error downloading version " latest-version ". Do both the directory and version exist?")
                          {:version version
                           :dir     dir
                           :url     (url latest-version)
                           :jar-path (dir->file latest-version dir)})))))
    {:latest-version latest-version
     :jar-path (dir->file latest-version dir)}))

(defn- without-slash [s] (str/replace s #"/$" ""))

(defn- major-version [version]
  (if (re-matches #"\d+\.\d+\.\d+" version)
    (Integer/parseInt (second (str/split version #"\.")))
    (Integer/parseInt version)))

(defn jar-download
  "Download a specific version of Metabase to a directory.

  Version can be a major version (like 50), or a full version (like 50.0.1). If only a major version is provided, the
  latest minor version will be used."
  [parsed]
  (let [[version dir]      (:arguments parsed)
        delete?            (:delete (:options parsed))
        run?               (:run (:options parsed))
        dir                (some-> (or dir (u/env "JARS" (fn [] (println "JARS not set in env, defaulting to"
                                                                         (str u/project-root-directory "/jars"))))
                                       (str u/project-root-directory "/jars"))
                                   without-slash)
        {:keys [latest-version
                jar-path]} (download-jar! version dir delete?)]
    (when run?
      ;; Check that the embedding token is set:
      (u/env "MB_PREMIUM_EMBEDDING_TOKEN"
             #(throw (ex-info (str "MB_PREMIUM_EMBEDDING_TOKEN is not set, please set it to run "
                                   "your jar (it is in 1password. ask on slack if you need help).")
                              {:parsed-args    (dissoc parsed :summary)
                               :latest-version latest-version})))
      (let [port        (+ 3000 (major-version latest-version))
            socket-port (+ 3000 port)
            db-file     (str "metabase_" version ".db")
            extra-env   {"MB_DB_TYPE"          "h2"
                         "MB_DB_FILE"          db-file
                         "MB_JETTY_PORT"       port
                         "MB_CONFIG_FILE_PATH" (str u/project-root-directory "/mage/jar_download_config.yml")}
            run-jar-cmd (str "java -Dclojure.server.repl=\"{:port " socket-port " :accept clojure.core.server/repl}\" -jar " jar-path)]
        (println (c/magenta "Running: " run-jar-cmd))
        (println "env:")
        (doseq [[k v] extra-env]
          (println (str "  " (c/yellow k) "=" (c/green v))))
        (println "Socket repl will open on " socket-port ". See: https://lambdaisland.com/guides/clojure-repls/clojure-repls#org259d775")
        (println (str "\n\n   Open in browser: http://localhost:" port "\n"))
        (p/shell {:dir dir :extra-env extra-env} run-jar-cmd)))))
