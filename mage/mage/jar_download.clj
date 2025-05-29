(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [babashka.fs :as fs]
   [babashka.process :as p]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.io File]))

(set! *warn-on-reflection* true)

(defn- branch-exists? [branch-name]
  (println "Checking if branch exists:" (c/yellow branch-name))
  (let [ls-remotes (u/sh "git" "ls-remote" "--heads" "origin" branch-name)]
    (str/includes? ls-remotes branch-name)))

;; START JUNK
(defn- keep-first
  "like (fn [f coll] (first (keep f coll))) but does not do chunking."
  [f coll]
  (reduce (fn [_ element] (when-let [resp (f element)] (reduced resp)))
          nil
          coll))

(defn- get-gh-token []
  (u/env "GH_TOKEN" #(throw (ex-info
                             (-> "Please set GH_TOKEN."
                                 (str "\n" (c/white "This API is available for authenticated users, OAuth Apps, and GitHub Apps."))
                                 (str "\n" (c/white "Access tokens require") (c/cyan "repo scope")
                                      (c/white "for private repositories and") (c/cyan "public_repo scope")  (c/white "for public repositories."))
                                 (str "\nMore info at: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token")
                                 (str "\nYou can make one (classic) here: https://github.com/settings/tokens"))
                             {:babashka/exit 1}))))

(defn- gh-get
  [url]
  (try (-> url
           (curl/get {:headers {"Accept" "application/vnd.github+json"
                                "Authorization" (str "Bearer " (get-gh-token))}})
           :body
           (json/decode true))
       (catch Exception e (throw (ex-info (str "Github GET error.\n" (pr-str e)) {:url url})))))

(defn- ee-artifact-uberjar-url [url]
  (->> (gh-get url)
       :artifacts
       (keep (fn [{nname :name :keys [archive_download_url] :as _artifact}]
               (when (and (str/starts-with? nname "metabase-ee") (str/ends-with? nname "-uberjar"))
                 archive_download_url)))
       first))

(defn- no-artifact-found-error [branch]
  (println "\nCould not find an uberjar for branch" (c/red branch))
  (println "Our Github Actions retention period is currently 3 months.")
  (println "If you are looking to run an older branch, that can be why it is not found.")
  (println "Pushing an empty commit to the branch will rebuild it on Github Actions, which should take a few minutes.")
  (println "More info: https://docs.github.com/en/actions/managing-workflow-runs/removing-workflow-artifacts#setting-the-retention-period-for-an-artifact")
  (throw (ex-info (str "No artifact found for branch: " branch)
                  {:babashka/exit 1 :branch branch})))

(defn- branch->latest-artifact [branch]
  (println (c/cyan "Getting artifact urls for branch: " branch))
  (let [artifact-urls (->> (str "https://api.github.com/repos/metabase/metabase/actions/runs?per_page=100&branch=" branch)
                           gh-get
                           :workflow_runs
                           (mapv :artifacts_url))]
    (println "Checking for artifacts for branch:" (c/yellow branch))
    (or (keep-first ee-artifact-uberjar-url artifact-urls)
        (no-artifact-found-error branch))))

(defn- url [version]
  (if-let [branch (:branch version)]
    (branch->latest-artifact branch)
    (str "https://downloads.metabase.com"
         (when (str/starts-with? version "1") "/enterprise")
         "/v"
         version "/metabase.jar")))

(defn- dir->file ^File [version dir]
  (if-let [branch (:branch version)]
    (io/file (str dir "/metabase_branch_" branch ".jar"))
    (io/file (str dir "/metabase_" version ".jar"))))

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

(defn- find-latest-version [version]
  (cond
    (re-matches #"\d+" version) (str "1." (latest-patch-version version))
    (re-matches #"\d+\.\d+\.\d+" version) version
    (branch-exists? version) {:branch version}
    :else (throw (ex-info (str "Invalid version format + branch not found:" version)
                          {:version version}))))

(defn- size-mb [bytes]
  (let [size (/ bytes 1024.0 1024.0)]
    (if (< size 1)
      (str (int (* size 1000)) " KB")
      (str (int size) " MB"))))

(defn- download-jar! [version dir delete?]
  (let [latest-version (find-latest-version version)
        jar-path (dir->file latest-version dir)
        dl-url (url latest-version)]
    (when (and delete? (fs/exists? jar-path))
      (fs/delete jar-path)
      (println (c/red "Found and deleted old jar.")))
    (when-not (fs/exists? (io/file dir))
      (println (c/blue "Creating directory " dir))
      (fs/create-dirs dir))
    (if (fs/exists? jar-path)
      (println "Already downloaded" (c/green dl-url)
               ".jar to" (c/green jar-path)
               ", size:" (c/red (size-mb (fs/size jar-path))))
      (try
        (println (str "Downloading from: " dl-url
                      "\n              to: " jar-path " ..."))
        (if (:branch latest-version)
          (p/shell {:dir dir} (str "curl"
                                   " -H \"Accept:application/vnd.github+json\""
                                   " -H \"Authorization:Bearer " (u/env "GH_TOKEN") "\""
                                   " -Lo metabase.zip"
                                   " " dl-url))
          (u/with-throbber "Downloading Version... "
            (fn [] (download latest-version dir))))
        (println "Downloaded.")
        (catch Exception e
          (throw (ex-info (str (ex-message e)
                               " | Error downloading version " latest-version ". Do both the directory and version exist?")
                          (merge (ex-data e)
                                 {:version version
                                  :dir     dir
                                  :url     dl-url
                                  :jar-path jar-path}))))))
    {:latest-version latest-version
     :jar-path jar-path}))

(defn- without-slash [s] (str/replace s #"/$" ""))

(defn- major-version [version]
  (if (re-matches #"\d+\.\d+\.\d+" version)
    (Integer/parseInt (second (str/split version #"\.")))
    (Integer/parseInt version)))

(defn port-for-version
  "Returns consistent ports to use for a given Metabase version/branch."
  [version]
  (+ 3000
     (if-let [branch (:branch version)]
       (Math/abs (hash branch)) ; Use hash of branch name for port
       (major-version version)))) ; Use major version for port

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
        ;; latest-version could be a string (indicating a version) or a map with :branch key:
        {:keys [latest-version jar-path]} (download-jar! version dir delete?)]
    (when run?
      ;; Check that the embedding token is set:
      (u/env "MB_PREMIUM_EMBEDDING_TOKEN"
             #(throw (ex-info (str "MB_PREMIUM_EMBEDDING_TOKEN is not set, please set it to run "
                                   "your jar (it is in 1password. ask on slack if you need help).")
                              {:parsed-args    (dissoc parsed :summary) :latest-version latest-version :babashka/exit 1})))
      (let [port        (+ 3000 (port-for-version latest-version))
            socket-port (+ 3000 port)
            db-file     (str u/project-root-directory "/metabase_" version ".db")
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
