(ns mage.jar-download
  (:require
   [babashka.curl :as curl]
   [babashka.fs :as fs]
   [babashka.process :as p]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import [java.io File]))

(set! *warn-on-reflection* true)

(defn- branch-exists? [branch-name]
  (println "Checking if branch exists:" (c/yellow branch-name))
  (let [ls-remotes (u/sh "git" "ls-remote" "--heads" "origin" branch-name)]
    (when (str/includes? ls-remotes branch-name)
      (println "Found branch:" (c/green branch-name))
      true)))

(defn- keep-first
  "like (fn [f coll] (first (keep f coll))) but does not do chunking."
  [f coll]
  (reduce (fn [_ element] (when-let [resp (f element)] (reduced resp))) nil coll))

(defn- get-gh-token-from-env []
  (u/env "GH_TOKEN" #(throw (ex-info
                             (-> "Please set GH_TOKEN."
                                 (str "\n" (c/white "This API is available for authenticated users, OAuth Apps, and GitHub Apps."))
                                 (str "\n" (c/white "Access tokens require") (c/cyan "repo scope")
                                      (c/white "for private repositories and") (c/cyan "public_repo scope")  (c/white "for public repositories."))
                                 (str "\nMore info at: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token")
                                 (str "\nYou can make one (prefer classic) here: https://github.com/settings/tokens"))
                             {:babashka/exit 1}))))

(defn- gh-get
  [url]
  (try (-> url
           (curl/get {:headers {"Accept" "application/vnd.github+json"
                                "Authorization" (str "Bearer " (get-gh-token-from-env))}})
           :body
           (json/decode true))
       (catch Exception e (throw (ex-info (str "Github GET error.\n" (pr-str e)) {:url url})))))

(defn- artifact-url->artifact-data [url]
  (->> (gh-get url)
       :artifacts
       (keep-first
        (fn [{nname :name :keys [archive_download_url] :as artifact}]
          (println "🟨 Checking artifact:     " (c/yellow nname) "at" (c/yellow archive_download_url))
          (when (and (str/starts-with? nname "metabase-ee") (str/ends-with? nname "-uberjar"))
            (u/debug ["ARTIFACT" artifact])
            (println "🟩 Found uberjar artifact:" (c/green nname) "at" (c/green archive_download_url))
            artifact)))))

(defn- no-artifact-found-error [branch]
  (throw (ex-info (-> (str "\nCould not find an uberjar for branch " (c/red branch))
                      (str "\n- Our Github Actions retention period does not last forever, so this branch's artifacts could have been removed.")
                      (str "\n  If you are looking to run a very old branch, that can cause this error.")
                      (str "\n  More info: https://docs.github.com/en/actions/managing-workflow-runs/removing-workflow-artifacts#setting-the-retention-period-for-an-artifact"))
                  {:babashka/exit 1
                   :branch branch})))

(def branch->latest-artifact
  (memoize (fn [branch]
             (println (c/cyan "Loading artifact urls for branch: ") branch)
             (let [artifact-urls (->> (str "https://api.github.com/repos/metabase/metabase/actions/runs?per_page=100&branch=" branch)
                                      gh-get
                                      :workflow_runs
                                      (mapv :artifacts_url))]
               (println "Checking artifacts for branch:" (c/yellow branch))
               (when (empty? artifact-urls)
                 (throw (ex-info (str "No artifacts found for branch: " branch ". Is there a PR for this branch?")
                                 {:branch branch
                                  :babashka/exit 1})))
               (or (keep-first artifact-url->artifact-data artifact-urls)
                   (no-artifact-found-error branch))))))

(defn- url [version]
  (if-let [branch (:branch version)]
    (:archive_download_url (branch->latest-artifact branch))
    (str "https://downloads.metabase.com"
         (when (str/starts-with? version "1") "/enterprise")
         "/v"
         version "/metabase.jar")))

(defn- dir->file ^File [version dir]
  (if-let [branch (:branch version)]
    ;; use head sha as the jar name so we can skip re-downloading the same thing
    (let [sha (:head_sha (:workflow_run (branch->latest-artifact branch)))]
      (io/file (str dir "/metabase_branch_" branch "_" sha ".jar")))
    (io/file (str dir "/metabase_" version ".jar"))))

(defn- download [version jar-path]
  (io/copy
   (:body (curl/get (url version) {:as :stream}))
   jar-path))

(defn latest-patch-version
  "`major-version` is a string like \"53\", returns major.minor version, like \"53.10\""
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

(defn- find-latest-version
  "Returns the latest version for a given version string, or a map with {:branch branch-name}."
  [version]
  (cond
    (re-matches #"(v?)\d+\.\d+\.\d+.*" version) (str/replace version #"^v" "")
    (re-matches #"\d+" version) (str "1." (latest-patch-version version))
    (branch-exists? version) {:branch version}
    :else (throw (ex-info (str "Invalid version format + branch not found:" version)
                          {:version version}))))

(comment
  (find-latest-version "1.56.0-beta")
  ;; => "1.56.0-beta"
  (find-latest-version "v1.56.0-beta")
  ;; => "1.56.0-beta"
  (find-latest-version "50")
  ;; => "1.50.36"
  (find-latest-version "1.50.35")
  ;; => "1.50.35"
  (find-latest-version "master")
  ;; => {:branch "master"}
  (try (find-latest-version "branch-that-does-not-exist")
       (catch Exception e
         [(ex-message e) (ex-data e)]))
  ;; => ["Invalid version format + branch not found:branch-that-does-not-exist"
  ;;     {:version "branch-that-does-not-exist"}]
  )

(defn- jar-size-mb [bytes]
  (let [size (/ bytes 1024.0 1024.0)]
    (when (< size 400)
      (println
       (c/on-yellow
        (c/bold "⚠️  Warning: ")
        "Jar size is less than 400 MB, this is unusual and may indicate a failed download.\n"
        "Please rerun jar-download with --delete option.\n")
       (c/yellow "See: ./bin/mage jar-download --help")))
    (if (< size 1)
      (str (int (* size 1000)) " KB")
      (str (int size) " MB"))))

(defn- download-and-extract-branch [dir jar-path dl-url]
  (let [zip-path (str/replace (str jar-path) #"\.jar$" ".zip")
        unzip-path (str/replace (str jar-path) #"\.jar$" "")
        jar-unzipped-path (str unzip-path "/target/uberjar/metabase.jar")]
    (try
      (println "downloading artifact from " (c/green dl-url) "to" (c/green zip-path) "...")
      (p/shell {:dir dir} (str "curl"
                               " -H \"Accept:application/vnd.github+json\""
                               " -H \"Authorization:Bearer " (get-gh-token-from-env) "\""
                               " -Lo " zip-path " " dl-url))
      (u/with-throbber (str "Extracting zip into" (c/green unzip-path))
        #(fs/unzip zip-path unzip-path {:replace-existing true}))
      (println "Moving jar from " (c/green jar-unzipped-path) "to" (c/green jar-path))
      (fs/move (io/file jar-unzipped-path) (io/file jar-path) {:replace-existing true})
      (println "✅ Downloaded and extracted branch jar to" (c/green jar-path))
      (finally
        (fs/delete zip-path)))))

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
      (println (str "Already downloaded " (c/green dl-url) " to " (c/green jar-path)
                    ", size: " (c/red (c/bold (jar-size-mb (fs/size jar-path))))))
      (try
        (if (:branch latest-version)
          (download-and-extract-branch dir jar-path dl-url)
          (do (println (str "Downloading from: " dl-url
                            "\n              to: " jar-path " ..."))
              (u/with-throbber "Downloading Version... "
                #(download latest-version jar-path))))
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

(defn- major-version [version]
  (if (re-matches #"\d+\.\d+\.\d+" version)
    (Integer/parseInt (second (str/split version #"\.")))
    (Integer/parseInt version)))

(defn port-for-version
  "Returns consistent ports to use for a given Metabase version/branch."
  [version]
  (+ 3000
     (if-let [branch (:branch version)]
       (rem (Math/abs (hash branch)) 1000) ; Use hash of branch name for port
       (major-version version))))                           ; Use major version for port

(defn- parse-lein-env [env-file]
  (let [content (slurp env-file)
        ;; Remove lines starting with ; (comments)
        cleaned (->> (clojure.string/split-lines content)
                     (remove #(re-matches #"^\s*;.*" %))
                     (clojure.string/join "\n"))
        edn-map (edn/read-string cleaned)]
    (update-keys edn-map #(-> % name (clojure.string/upper-case) (clojure.string/replace "-" "_")))))

(defn- parse-env [env-file]
  (when (and env-file (not (fs/exists? env-file)))
    (throw (ex-info (str "Env file does not exist: " env-file)
                    {:env-file      env-file
                     :babashka/exit 1})))
  (if env-file
    (parse-lein-env env-file)
    {}))

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
                                   (str/replace #"/$" ""))
        ;; latest-version could be a version string like 1.50.35 or a map with :branch key
        {:keys [latest-version jar-path]} (download-jar! version dir delete?)]
    (when run?
      (let [port        (try (parse-long (:port (:options parsed)))
                             (catch Exception _
                               (port-for-version latest-version)))
            env-file (:env-file (:options parsed))
            socket-port (+ 3000 port)
            db-file (str u/project-root-directory "/metabase_" version ".db")
            extra-env (merge {"MB_DB_TYPE"          "h2"
                              "MB_DB_FILE"          db-file
                              "MB_JETTY_PORT"       port
                              "MB_CONFIG_FILE_PATH" (str u/project-root-directory "/mage/jar_download_config.yml")}
                             (parse-env env-file))
            run-jar-cmd (str "java -Dclojure.server.repl=\"{:port " socket-port " :accept clojure.core.server/repl}\" -jar " jar-path)]
        (println (c/magenta "Running: " run-jar-cmd))
        (println "env:")
        (doseq [[k v] extra-env]
          (println (str "  " (c/yellow k) "=" (c/green v))))

        (when (not (get extra-env "MB_PREMIUM_EMBEDDING_TOKEN"))
          ;; Check that the embedding token is set:
          (u/env "MB_PREMIUM_EMBEDDING_TOKEN"
                 #(throw (ex-info (str "MB_PREMIUM_EMBEDDING_TOKEN is not set, please set it to run "
                                       "your jar (it is in 1password. ask on slack if you need help).")
                                  {:parsed-args    (dissoc parsed :summary)
                                   :latest-version latest-version
                                   :jar-path       jar-path
                                   :babashka/exit  1}))))

        (println (str "Socket repl will open on " (c/green socket-port) ". "
                      "See: https://lambdaisland.com/guides/clojure-repls/clojure-repls#org259d775"))
        (println (str "\n\n   Open in browser: " (c/magenta "http://localhost:" port) "\n"))
        (p/shell {:dir u/project-root-directory :extra-env extra-env} run-jar-cmd)))))
