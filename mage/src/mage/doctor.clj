(ns mage.doctor
  "Health checks for Metabase development environment.
   Validates that all required tools are installed with correct versions."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.be-dev :as backend]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- sh
  "Run a command and return its stdout, or nil if command fails. Suppresses stderr."
  [& cmd]
  (try
    (let [result @(apply p/process {:out :string :err :string :dir u/project-root-directory} cmd)]
      (when (zero? (:exit result))
        (not-empty (str/trim (:out result)))))
    (catch Exception _ nil)))

(defn- sh+err
  "Run a command and return combined stdout+stderr (for commands like java -version)."
  [& cmd]
  (try
    (let [result @(apply p/process {:out :string :err :string} cmd)]
      (not-empty (str/trim (str (:out result) "\n" (:err result)))))
    (catch Exception _ nil)))

(defn- can-run?
  "Check if a command is available, suppressing warnings."
  [cmd]
  (binding [u/*skip-warning* true]
    (u/can-run? cmd)))

(defn- env-set?
  "Check if an environment variable is set."
  [env-var]
  (some? (u/env env-var (constantly nil))))

;;; -------------------------------------------------- Version Parsing --------------------------------------------------

(defn parse-version
  "Parse a version string into comparable parts. Returns vector of integers."
  [version-str]
  (when version-str
    (->> (re-seq #"\d+" version-str)
         (take 3)
         (mapv parse-long))))

(defn version>=
  "Check if version a >= version b. Compares major.minor.patch semantically."
  [a b]
  (let [a-parts (parse-version a)
        b-parts (parse-version b)
        ;; Pad shorter vector with zeros for proper comparison
        max-len (max (count a-parts) (count b-parts))
        pad (fn [v] (into v (repeat (- max-len (count v)) 0)))
        a-padded (pad a-parts)
        b-padded (pad b-parts)]
    (>= (compare a-padded b-padded) 0)))

;;; -------------------------------------------------- Tool Info Gathering --------------------------------------------------

(defn- get-tool-version
  "Get version string for a tool by running it directly."
  [tool]
  (case tool
    "git"      (some-> (sh "git" "--version") (str/replace #"git version\s*" ""))
    "node"     (some-> (sh "node" "--version") (str/replace #"^v" ""))
    "yarn"     (sh "yarn" "--version")
    "java"     (when-let [output (sh+err "java" "-version")]
                 (when-let [match (re-find #"version\s+\"([^\"]+)\"" output)]
                   (second match)))
    "clojure"  (some-> (sh "clojure" "--version")
                       (str/replace #"Clojure CLI version\s*" ""))
    "babashka" (some-> (sh "bb" "--version")
                       (str/replace #"babashka\s*v?" ""))
    "docker"   (some-> (sh "docker" "--version")
                       (str/replace #"Docker version\s*" "")
                       (str/replace #",.*" ""))
    "mise"     (sh "mise" "--version")
    nil))

(def ^:private tool-commands
  "Map of tool name to the command used to run it."
  {"babashka" "bb"})

(defn- check-tool
  "Check if a tool is installed and get its version.
   Returns {:installed? bool, :version str-or-nil}.
   A tool is considered installed only if we can successfully get its version."
  [tool]
  (let [cmd (get tool-commands tool tool)]
    (if (can-run? cmd)
      (if-let [version (get-tool-version tool)]
        {:installed? true :version version}
        ;; Command exists but version check failed (e.g., yarn without node)
        {:installed? false :binary-exists? true})
      {:installed? false})))

(defn- java-vendor
  "Detect Java vendor from version output."
  []
  (when-let [output (sh+err "java" "-version")]
    (cond
      (str/includes? (str/lower-case output) "temurin") :temurin
      (str/includes? (str/lower-case output) "openjdk") :openjdk
      (str/includes? (str/lower-case output) "oracle")  :oracle
      (str/includes? (str/lower-case output) "zulu")    :zulu
      (str/includes? (str/lower-case output) "corretto") :corretto
      :else :unknown)))

;;; -------------------------------------------------- Mise Info --------------------------------------------------

(defn- get-mise-info
  "Get mise installation and configuration info.
   Returns {:installed? bool, :activated? bool, :toolset map}."
  []
  (if-not (can-run? "mise")
    {:installed? false}
    (let [doctor-json (try
                        (some-> (sh "mise" "doctor" "--json")
                                json/read-str)
                        (catch Exception _ nil))
          config-json (try
                        (some-> (sh "mise" "config" "--json")
                                json/read-str)
                        (catch Exception _ nil))
          project-config (->> config-json
                              (filter #(str/starts-with? (str (:path %)) u/project-root-directory))
                              first)]
      {:installed? true
       :activated? (:activated doctor-json false)
       :toolset (when-let [ts (:toolset doctor-json)]
                  (into {}
                        (for [[tool versions] ts
                              :let [v (-> versions first :version)]
                              :when v]
                          [(keyword tool) v])))
       :project-tools (set (:tools project-config))})))

;;; -------------------------------------------------- Version Manager Detection --------------------------------------------------

(def ^:private version-manager-config
  {"nvm"    {:name "nvm (Node Version Manager)" :home "~/.nvm" :env ["NVM_DIR"]}
   "fnm"    {:name "fnm (Fast Node Manager)" :home "~/.fnm"}
   "volta"  {:name "Volta" :home "~/.volta"}
   "asdf"   {:name "asdf" :home "~/.asdf"}
   "mise"   {:name "mise"}
   "jenv"   {:name "jenv" :home "~/.jenv"}
   "sdkman" {:name "SDKMAN!" :home "~/.sdkman" :env ["SDKMAN_DIR"]}})

(defn- detect-version-managers
  "Detect which version managers are present."
  []
  (into {}
        (for [[cmd {:keys [name home env]}] version-manager-config
              :let [present? (or (can-run? cmd)
                                 (and home (fs/exists? (fs/expand-home home)))
                                 (and env (some env-set? env)))]
              :when present?]
          [(keyword cmd) {:name name}])))

;;; -------------------------------------------------- Project State --------------------------------------------------

(defn- check-path-exists
  "Check if a path exists relative to project root."
  [path]
  (fs/exists? (str u/project-root-directory "/" path)))

(defn- check-file-conflicts
  "Check if a file has merge conflict markers."
  [path]
  (let [full-path (str u/project-root-directory "/" path)]
    (when (fs/exists? full-path)
      (str/includes? (slurp full-path) "<<<<<<<"))))

(defn- check-nrepl-port
  "Check .nrepl-port file status."
  []
  (let [path (str u/project-root-directory "/.nrepl-port")]
    (if-not (fs/exists? path)
      {:exists? false}
      (let [port (try (parse-long (str/trim (slurp path))) (catch Exception _ nil))]
        (if-not port
          {:exists? true :valid? false}
          (let [result (try
                         @(p/process {:out :string :err :string} "lsof" "-i" (str ":" port) "-sTCP:LISTEN")
                         (catch Exception _ nil))
                listening? (and result
                                (zero? (:exit result))
                                (not (str/blank? (:out result))))
                nrepl-type (when listening? (backend/nrepl-type nil))]
            {:exists? true
             :valid? true
             :port port
             :listening? listening?
             :nrepl-type nrepl-type}))))))

(defn- check-git-hooks
  "Check git hooks configuration."
  []
  (let [hooks-path (-> (sh "git" "config" "--get" "core.hooksPath")
                       (or "")
                       str/trim)]
    (if (not (str/blank? hooks-path))
      ;; Custom hooks path (e.g., Husky)
      {:configured? (fs/exists? (str u/project-root-directory "/" hooks-path "/pre-commit"))
       :path hooks-path}
      ;; Default .git/hooks
      {:configured? (fs/exists? (str u/project-root-directory "/.git/hooks/pre-commit"))
       :path ".git/hooks"})))

(defn- get-project-state
  "Get project file/directory state."
  []
  {:node-modules {:exists? (check-path-exists "node_modules")}
   :nrepl-port (check-nrepl-port)
   :git-hooks (check-git-hooks)
   :mise-local {:exists? (check-path-exists "mise.local.toml")}
   :yarn-lock {:exists? (check-path-exists "yarn.lock")
               :conflicts? (check-file-conflicts "yarn.lock")}
   :deps-edn {:exists? (check-path-exists "deps.edn")
              :conflicts? (check-file-conflicts "deps.edn")}})

;;; -------------------------------------------------- Git Status --------------------------------------------------

(defn get-git-status
  "Get git repository status. Separate function since it may be slow (fetches)."
  []
  (let [_ (try @(p/process {:out :string :err :string :dir u/project-root-directory}
                           "git" "fetch" "--quiet")
               (catch Exception _ nil))
        branch (sh "git" "rev-parse" "--abbrev-ref" "HEAD")
        porcelain (sh "git" "status" "--porcelain")
        rev-list (when branch
                   (sh "git" "rev-list" "--left-right" "--count"
                       (str "HEAD...origin/" branch)))
        [ahead behind] (when rev-list
                         (map parse-long (str/split rev-list #"\t")))]
    {:branch branch
     :ahead (or ahead 0)
     :behind (or behind 0)
     :clean? (str/blank? porcelain)
     :uncommitted-count (if (str/blank? porcelain)
                          0
                          (count (str/split-lines porcelain)))}))

;;; -------------------------------------------------- Main Diagnose Function --------------------------------------------------

(defn diagnose
  "Gather all environment diagnostic info. Returns a map with:
   - :mise - mise installation/activation status
   - :version-managers - detected version managers
   - :tools - map of tool-name to {:installed? :version ...}
   - :project - project file states

   Note: Does NOT include git status (use get-git-status separately for that)."
  []
  (let [mise (get-mise-info)
        toolset (:toolset mise)]
    {:mise mise
     :version-managers (detect-version-managers)
     :tools {:git (check-tool "git")
             :node (let [info (check-tool "node")]
                     (if-not (:installed? info)
                       (if-let [v (:node toolset)]
                         {:installed? true :version v :source :mise}
                         info)
                       info))
             :yarn (let [info (check-tool "yarn")]
                     (if-not (:installed? info)
                       (if-let [v (:yarn toolset)]
                         {:installed? true :version v :source :mise}
                         info)
                       info))
             :java (let [info (check-tool "java")]
                     (if (:installed? info)
                       (assoc info :vendor (java-vendor))
                       (if-let [v (:java toolset)]
                         {:installed? true :version v :source :mise}
                         info)))
             :clojure (let [info (check-tool "clojure")]
                        (if-not (:installed? info)
                          (if-let [v (:clojure toolset)]
                            {:installed? true :version v :source :mise}
                            info)
                          info))
             :babashka (check-tool "babashka")
             :docker (check-tool "docker")}
     :project (get-project-state)}))

;;; -------------------------------------------------- Formatting / Printing --------------------------------------------------

(defn- format-tool-status
  "Format a tool check for display. Returns {:name :status :message :hint}."
  [tool-name {:keys [installed? version vendor]} & {:keys [required-version vendor-hint]}]
  (let [display-name (case tool-name
                       :git "Git"
                       :node "Node.js"
                       :yarn "Yarn"
                       :java "Java"
                       :clojure "Clojure CLI"
                       :babashka "Babashka"
                       :docker "Docker"
                       (name tool-name))]
    (cond
      (not installed?)
      {:name display-name
       :status :error
       :message "Not installed"
       :hint "Run `./bin/dev-install` to set up your environment"}

      ;; Version validation
      (and required-version (not (version>= version required-version)))
      {:name display-name
       :status :error
       :message (str version " (requires >= " required-version ")")
       :hint (str "Upgrade " display-name " to version " required-version "+")}

      ;; Yarn must be 1.x
      (and (= tool-name :yarn) version (not (str/starts-with? version "1.")))
      {:name display-name
       :status :error
       :message (str version " (requires Yarn Classic 1.x)")
       :hint "Metabase requires Yarn Classic 1.x, NOT Berry/2+"}

      ;; Java vendor warning
      (and (= tool-name :java) vendor-hint (not= vendor :temurin))
      {:name display-name
       :status :warn
       :message (str version " (" (name (or vendor :unknown)) ")")
       :hint "Consider using Eclipse Temurin for consistency"}

      :else
      {:name display-name
       :status :ok
       :message (str (or version "installed")
                     (when (and (= tool-name :yarn) version) " (Classic)")
                     (when (= vendor :temurin) " Temurin"))})))

(defn- status-icon [status]
  (case status
    :ok (c/green "✓")
    :warn "⚠"
    :error (c/red "✗")
    :info (c/yellow "–")))

(defn- print-check [{:keys [name status message hint]}]
  (let [icon (status-icon status)
        msg (case status
              :ok (c/green message)
              :warn (c/yellow message)
              :error (c/red message)
              :info (c/yellow message))]
    (if hint
      (println (str "- " icon " **" name "**: " msg " " (c/gray (str "— " hint))))
      (println (str "- " icon " **" name "**: " msg)))))

(defn- print-section [title]
  (println)
  (println (str "## " (c/bold title))))

;;; -------------------------------------------------- Doctor Command --------------------------------------------------

(defn doctor!
  "Run all health checks and print results."
  []
  (println)
  (println (c/bold "# 🩺 Metabase Development Environment Doctor"))

  (let [{:keys [mise version-managers tools project]} (diagnose)
        *git-status (future (get-git-status))

        ;; Format all tool checks
        tool-checks [(format-tool-status :git (:git tools))
                     (format-tool-status :node (:node tools) :required-version "22")
                     (format-tool-status :yarn (:yarn tools))
                     (format-tool-status :java (:java tools) :required-version "21" :vendor-hint true)
                     (format-tool-status :clojure (:clojure tools))
                     (format-tool-status :babashka (:babashka tools))]

        mise-check (cond
                     (not (:installed? mise))
                     {:name "mise" :status :warn :message "not installed"
                      :hint "Run `./bin/dev-install` to set up your environment"}
                     (not (:activated? mise))
                     {:name "mise" :status :warn :message "not activated"
                      :hint "Run `mise activate` in your shell"}
                     :else
                     {:name "mise" :status :ok :message "activated"})

        docker-check (if (:installed? (:docker tools))
                       {:name "Docker" :status :ok :message (:version (:docker tools))}
                       {:name "Docker" :status :warn :message "Not installed"
                        :hint "Optional: Install Docker for database testing"})

        ;; Project checks
        project-checks
        [(if (get-in project [:node-modules :exists?])
           {:name "node_modules" :status :ok :message "Present"}
           {:name "node_modules" :status :warn :message "Missing"
            :hint "Run `yarn install` to install frontend dependencies"})

         (let [{:keys [exists? valid? port listening? nrepl-type]} (:nrepl-port project)]
           (cond
             (not exists?)
             {:name ".nrepl-port" :status :info :message "Not present (backend not started)"}
             (not valid?)
             {:name ".nrepl-port" :status :warn :message "Invalid port file"
              :hint "Delete .nrepl-port and restart your backend"}
             listening?
             {:name ".nrepl-port" :status :ok :message (str "Port " port " (backend running)"
                                                            (when nrepl-type (str " (repl type " nrepl-type ")")))}
             :else
             {:name ".nrepl-port" :status :warn :message (str "Port " port " (backend not running)")
              :hint "Stale .nrepl-port file - delete it or restart backend"}))

         (let [{:keys [configured? path]} (:git-hooks project)]
           (if configured?
             {:name "Git hooks" :status :ok :message (str "Configured (" path ")")}
             {:name "Git hooks" :status :warn :message "Missing"
              :hint "Run `yarn install` to set up git hooks"}))]

        conflict-checks
        [(if-not (get-in project [:yarn-lock :exists?])
           {:name "yarn.lock" :status :warn :message "Missing"
            :hint "Run `yarn install` to generate"}
           (if (get-in project [:yarn-lock :conflicts?])
             {:name "yarn.lock" :status :error :message "Has merge conflicts"
              :hint "Resolve conflicts in yarn.lock"}
             {:name "yarn.lock" :status :ok :message "No conflicts"}))

         (if-not (get-in project [:deps-edn :exists?])
           {:name "deps.edn" :status :error :message "Missing"
            :hint "deps.edn is required"}
           (if (get-in project [:deps-edn :conflicts?])
             {:name "deps.edn" :status :error :message "Has merge conflicts"
              :hint "Resolve conflicts in deps.edn"}
             {:name "deps.edn" :status :ok :message "No conflicts"}))]

        git-checks
        (let [{:keys [branch ahead behind] :as git-status} @*git-status]
          [(cond
             (and (zero? ahead) (zero? behind))
             {:name "Branch" :status :ok :message (str branch " (up to date)")}
             (and (pos? ahead) (zero? behind))
             {:name "Branch" :status :info :message (str branch " (" ahead " ahead)")
              :hint "You have unpushed commits"}
             (and (zero? ahead) (pos? behind))
             {:name "Branch" :status :warn :message (str branch " (" behind " behind)")
              :hint "Run `git pull` to update"}
             :else
             {:name "Branch" :status :warn :message (str branch " (" ahead " ahead, " behind " behind)")
              :hint "Branch has diverged — consider rebasing"})
           (if (:clean? git-status)
             {:name "Working tree" :status :ok :message "Clean"}
             {:name "Working tree" :status :info
              :message (str (:uncommitted-count git-status) " uncommitted change(s)")
              :hint "You have local changes"})])

        ;; Collect all for summary
        all-checks (concat [mise-check] tool-checks project-checks conflict-checks)
        errors (filterv #(= :error (:status %)) all-checks)
        warnings (filterv #(= :warn (:status %)) all-checks)]

    ;; Version managers
    (print-section "Version Managers")
    (if (empty? version-managers)
      (println (str "- " (c/gray "None detected (using system tools)")))
      (do
        (doseq [[_ {:keys [name]}] (sort-by key version-managers)]
          (println (str "- " (c/green "✓") " " name)))
        (when (> (count version-managers) 1)
          (println (str "- " (c/yellow "⚠") " **Warning**: Multiple version managers detected — can cause conflicts")))))

    ;; Required tools
    (print-section "Required Tools")
    (doseq [check tool-checks]
      (print-check check))

    ;; Development tools
    (print-section "Development Tools")
    (print-check mise-check)
    (print-check docker-check)

    ;; Git status
    (print-section "Git Status")
    (doseq [check git-checks]
      (print-check check))
    (doseq [check conflict-checks]
      (print-check check))

    ;; Project state
    (print-section "Project State")
    (doseq [check project-checks]
      (print-check check))

    ;; Summary
    (println)
    (when (seq errors)
      (let [n (count errors)]
        (println (c/red (c/bold (str "✗ " n " error" (when (not= n 1) "s") " found."))))
        (doseq [err errors]
          (print-check err))
        (println (str "Run " (c/green "./bin/dev-install") " to fix most issues."))
        (u/exit 1)))

    (when (seq warnings)
      (let [n (count warnings)]
        (println (c/yellow (c/bold (str "⚠ " n " warning" (when (not= n 1) "s") " found."))))
        (doseq [warn warnings]
          (print-check warn))
        (println (c/yellow "Environment should work, but consider fixing."))))

    (when (and (empty? errors) (empty? warnings))
      (println (c/green (c/bold "✓ All checks passed!"))))

    (println)
    (println (c/gray "Docs: docs/developers-guide/devenv.md"))))
