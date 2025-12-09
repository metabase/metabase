(ns mage.doctor
  "Health checks for Metabase development environment.
   Validates that all required tools are installed with correct versions."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Configuration --------------------------------------------------

(def config
  "Declarative configuration for all doctor checks."
  {:version-managers
   ;; Detected by: command exists OR home directory exists OR env var set
   {"nvm" {:name "nvm (Node Version Manager)"
           :home "~/.nvm"
           :env ["NVM_DIR"]}
    "fnm" {:name "fnm (Fast Node Manager)"
           :home "~/.fnm"}
    "volta" {:name "Volta"
             :home "~/.volta"}
    "asdf" {:name "asdf"
            :home "~/.asdf"}
    "mise" {:name "mise"}
    "jenv" {:name "jenv"
            :home "~/.jenv"}
    "sdkman" {:name "SDKMAN!"
              :home "~/.sdkman"
              :env ["SDKMAN_DIR"]}}

   :required-tools
   ;; Tools required for Metabase development
   ;; :validate - fn that takes version string, returns {:ok true} or {:ok false :msg "..." :hint "..."}
   [{:tool "node"
     :name "Node.js"
     :validate :node-22+}
    {:tool "yarn"
     :name "Yarn"
     :validate :yarn-classic}
    {:tool "java"
     :name "Java"
     :validate :java-21-temurin}
    {:tool "clojure"
     :name "Clojure CLI"}
    {:tool "babashka"
     :name "Babashka"}]

   :dev-tools
   ;; Optional but recommended (not managed by mise)
   [{:cmd "docker"
     :name "Docker"
     :hint "Optional: Install Docker for database testing (OrbStack recommended on macOS)"}]

   :project-checks
   [{:path "node_modules"
     :name "node_modules"
     :ok-message "Present"
     :missing-status :warn
     :missing-hint "Run `yarn install` to install frontend dependencies"}
    {:path ".nrepl-port"
     :name ".nrepl-port"
     :special :nrepl-port}
    {:name "Git hooks"
     :special :git-hooks}
    {:path "mise.local.toml"
     :name "mise.local.toml"
     :ok-message "Present (personal overrides)"
     :missing-status :info
     :missing-hint "Optional: Create mise.local.toml for personal tool overrides"}]

   :conflict-checks
   [{:path "yarn.lock"
     :name "yarn.lock"
     :missing-status :warn
     :missing-hint "Run `yarn install` to generate"}
    {:path "deps.edn"
     :name "deps.edn"
     :missing-status :error
     :missing-hint "deps.edn is required"}]})

;;; -------------------------------------------------- Shell Helpers --------------------------------------------------

(defn- sh
  "Run a command and return its stdout, or nil if command fails."
  [& cmd]
  (try
    (not-empty (apply u/sh cmd))
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

;;; -------------------------------------------------- Check Result --------------------------------------------------

(defn- check-result
  "Create a check result map."
  [name status message & {:keys [hint]}]
  {:name name
   :status status
   :message message
   :hint hint})

;;; -------------------------------------------------- Version Parsing --------------------------------------------------

(defn- parse-major-version
  "Extract major version number from a version string like '21.0.1' or 'v22.13.1'."
  [version-str]
  (when version-str
    (some-> (re-find #"(\d+)" (str/replace version-str #"^v" ""))
            second
            parse-long)))

;;; -------------------------------------------------- Mise Integration --------------------------------------------------

(defn- get-mise-doctor-info
  "Get parsed output from `mise doctor --json`. Returns nil if mise not available."
  []
  (when (can-run? "mise")
    (try
      (let [output (sh "mise" "doctor" "--json")]
        (when output
          (json/read-str output)))
      (catch Exception _ nil))))

(defn- get-mise-toolset
  "Get the toolset map from mise doctor, keyed by tool name."
  [mise-info]
  (when-let [toolset (:toolset mise-info)]
    ;; toolset is {"node" [{:version "22.13.1"}], ...}
    ;; Flatten to {"node" "22.13.1", ...}
    (into {}
          (for [[tool versions] toolset
                :let [version (-> versions first :version)]
                :when version]
            [tool version]))))

(defn- get-mise-project-tools
  "Get list of tools configured for this project from mise config --json."
  []
  (when (can-run? "mise")
    (try
      (let [output (sh "mise" "config" "--json")
            configs (when output (json/read-str output))
            project-config (->> configs
                                (filter #(str/starts-with? (:path %) u/project-root-directory))
                                first)]
        (set (:tools project-config)))
      (catch Exception _ nil))))

;;; -------------------------------------------------- Tool Validators --------------------------------------------------

(defmulti validate-tool
  "Validate a tool version. Returns {:ok true} or {:ok false :msg \"...\" :hint \"...\"}."
  (fn [validator _version] validator))

(defmethod validate-tool :default [_ _]
  {:ok true})

(defmethod validate-tool :node-22+ [_ version]
  (let [major (parse-major-version version)]
    (if (and major (>= major 22))
      {:ok true}
      {:ok false
       :msg (str version " (requires >= 22)")
       :hint "Upgrade Node.js to version 22+"})))

(defmethod validate-tool :yarn-classic [_ version]
  (if (and version (str/starts-with? version "1."))
    {:ok true :suffix " (Classic)"}
    {:ok false
     :msg (str version " (requires Yarn Classic 1.x, NOT Berry/2+)")
     :hint "Metabase requires Yarn Classic 1.x"}))

(defmethod validate-tool :java-21-temurin [_ version]
  (let [major (parse-major-version version)
        is-temurin (and version (str/includes? (str/lower-case version) "temurin"))]
    (cond
      (nil? version)
      {:ok false :msg "Not installed" :hint "Run `mise install`"}

      (not= major 21)
      {:ok false
       :msg (str version " (requires Java 21)")
       :hint "Install Java 21 Eclipse Temurin"}

      (not is-temurin)
      {:ok :warn
       :msg (str version " (recommend Eclipse Temurin)")
       :hint "Consider switching to Eclipse Temurin for consistency"}

      :else
      {:ok true
       ;; Clean up the version display
       :version (-> version
                    (str/replace #"temurin-" "")
                    (str/replace #"\+.*" "")
                    (str " Temurin"))})))

;;; -------------------------------------------------- Tool Checks --------------------------------------------------

(defn- check-required-tool
  "Check a required tool using mise toolset."
  [toolset {:keys [tool name validate]}]
  (let [version (get toolset (keyword tool))]
    (if (nil? version)
      (check-result name :error "Not installed"
                    :hint "Run `mise install` or `./bin/dev-install`")
      (let [validation (validate-tool validate version)]
        (case (:ok validation)
          true
          (check-result name :ok
                        (str (or (:version validation) version)
                             (:suffix validation "")))
          :warn
          (check-result name :warn (:msg validation)
                        :hint (:hint validation))
          ;; false
          (check-result name :error (:msg validation)
                        :hint (:hint validation)))))))

(defn- check-dev-tool
  "Check an optional development tool (not mise-managed)."
  [{:keys [cmd name hint]}]
  (if (can-run? cmd)
    (let [version (some-> (sh cmd "--version")
                          (str/split #"\n")
                          first
                          (str/replace #"^Docker version " ""))]
      (check-result name :ok (or version "installed")))
    (check-result name :warn "Not installed" :hint hint)))

(defn- check-optional-tool
  "Check an optional tool from mise toolset. Returns nil if not installed."
  [toolset tool-name]
  (when-let [version (get toolset (keyword tool-name))]
    (check-result tool-name :ok version)))

(defn- check-git
  "Check git is installed (not managed by mise)."
  []
  (if-let [version (sh "git" "--version")]
    (check-result "Git" :ok (str/replace version #"git version " ""))
    (check-result "Git" :error "Not installed"
                  :hint "Git is required for Metabase development")))

;;; -------------------------------------------------- Version Manager Detection --------------------------------------------------

(defn- version-manager-present?
  "Check if a version manager is present based on its config."
  [cmd {:keys [home env]}]
  (or (can-run? cmd)
      (and home (fs/exists? (fs/expand-home home)))
      (and env (some env-set? env))))

(defn- detect-version-managers
  "Detect installed version managers from config."
  []
  (->> (:version-managers config)
       (filter (fn [[cmd cfg]] (version-manager-present? cmd cfg)))
       (mapv (fn [[cmd cfg]] {:cmd cmd :name (:name cfg)}))
       (sort-by :cmd)))

;;; -------------------------------------------------- Project Health Checks --------------------------------------------------

(defn- check-git-hooks-special
  "Check if git hooks are configured (supports both .git/hooks and custom hooksPath like Husky)."
  []
  (let [hooks-path (-> (sh "git" "config" "--get" "core.hooksPath")
                       (or "")
                       str/trim)]
    (if (not (str/blank? hooks-path))
      ;; Custom hooks path (e.g., Husky)
      (let [full-path (str u/project-root-directory "/" hooks-path "/pre-commit")]
        (if (fs/exists? full-path)
          (check-result "Git hooks" :ok (str "Configured (" hooks-path ")"))
          (check-result "Git hooks" :warn "Missing"
                        :hint "Run `yarn install` to set up Husky git hooks")))
      ;; Default .git/hooks
      (let [default-path (str u/project-root-directory "/.git/hooks/pre-commit")]
        (if (fs/exists? default-path)
          (check-result "Git hooks" :ok "Configured")
          (check-result "Git hooks" :warn "Missing"
                        :hint "Run `yarn install` to set up git hooks"))))))

(defn- check-nrepl-port-special
  "Check if .nrepl-port exists and if the port is actually listening."
  []
  (let [path (str u/project-root-directory "/.nrepl-port")]
    (if (fs/exists? path)
      (let [port (try (parse-long (str/trim (slurp path))) (catch Exception _ nil))]
        (if port
          (let [result (try
                         @(p/process {:out :string :err :string}
                                     "lsof" "-i" (str ":" port) "-sTCP:LISTEN")
                         (catch Exception _ nil))]
            (if (and result (zero? (:exit result)) (not (str/blank? (:out result))))
              (check-result ".nrepl-port" :ok (str "Port " port " (backend running)"))
              (check-result ".nrepl-port" :warn (str "Port " port " (backend not running)")
                            :hint "Stale .nrepl-port file - delete it or restart backend")))
          (check-result ".nrepl-port" :warn "Invalid port file"
                        :hint "Delete .nrepl-port and restart your backend")))
      (check-result ".nrepl-port" :info "Not present (backend not started)"
                    :hint "Start the backend REPL to enable mage REPL commands"))))

(defn- check-project-item
  "Check a project file/directory from config.
   Returns nil for optional missing items (missing-status :info)."
  [{:keys [path name ok-message missing-status missing-hint special]}]
  (case special
    :nrepl-port (check-nrepl-port-special)
    :git-hooks (check-git-hooks-special)
    ;; default: simple path check
    (let [full-path (str u/project-root-directory "/" path)]
      (if (fs/exists? full-path)
        (check-result name :ok (or ok-message "Present"))
        ;; Return nil for optional items, otherwise return the missing status
        (when-not (= missing-status :info)
          (check-result name missing-status "Missing"
                        :hint missing-hint))))))

(defn- check-conflict
  "Check a file for merge conflict markers."
  [{:keys [path name missing-status missing-hint]}]
  (let [full-path (str u/project-root-directory "/" path)]
    (if (fs/exists? full-path)
      (let [content (slurp full-path)]
        (if (str/includes? content "<<<<<<<")
          (check-result name :error "Has merge conflicts"
                        :hint (str "Resolve conflicts in " path))
          (check-result name :ok "No conflicts")))
      (check-result name missing-status "Missing"
                    :hint missing-hint))))

(defn- check-git-status
  "Check git working directory status."
  []
  (let [status (sh "git" "status" "--porcelain")]
    (if (str/blank? status)
      (check-result "Working tree" :ok "Clean")
      (let [lines (str/split-lines status)]
        (check-result "Working tree" :info (str (count lines) " uncommitted change(s)")
                      :hint "You have local changes")))))

(defn- check-git-branch-status
  "Check if current branch is up to date with remote."
  []
  (let [_ (try @(p/process {:out :string :err :string :dir u/project-root-directory}
                           "git" "fetch" "--quiet")
               (catch Exception _ nil))
        branch (sh "git" "rev-parse" "--abbrev-ref" "HEAD")
        status (sh "git" "rev-list" "--left-right" "--count"
                   (str "HEAD...origin/" branch))]
    (if (and branch status)
      (let [[ahead behind] (map parse-long (str/split status #"\t"))]
        (cond
          (and (zero? ahead) (zero? behind))
          (check-result "Branch" :ok (str branch (c/white " (up to date)")))

          (and (pos? ahead) (zero? behind))
          (check-result "Branch" :info (str branch " (" ahead " ahead)")
                        :hint "You have unpushed commits")

          (and (zero? ahead) (pos? behind))
          (check-result "Branch" :warn (str branch " (" behind " behind)")
                        :hint "Run `git pull` to update")

          :else
          (check-result "Branch" :warn (str branch " (" ahead " ahead, " behind " behind)")
                        :hint "Branch has diverged — consider rebasing")))
      (check-result "Branch" :info (or branch "unknown")
                    :hint "Could not determine remote status"))))

;;; -------------------------------------------------- Output Formatting --------------------------------------------------

(defn- status-icon [status]
  (case status
    :ok (c/green "✓")
    :warn (c/yellow "⚠")
    :error (c/red "✗")
    :info (c/yellow "–")))

(defn- format-check
  "Format and print a check result. Returns nil for nil input (skips output)."
  [{:keys [name status message hint] :as check}]
  (when check
    (let [icon (status-icon status)
          msg (case status
                :ok (c/green message)
                :warn (c/yellow message)
                :error (c/red message)
                :info (c/yellow message))]
      (if hint
        (println (str "- " icon " **" name "**: " msg " " (c/gray (str "— " hint))))
        (println (str "- " icon " **" name "**: " msg))))))

(defn- print-section [title]
  (println)
  (println (str "## " (c/bold title))))

;;; -------------------------------------------------- Main Entry Point --------------------------------------------------

(defn doctor!
  "Run all health checks and print results."
  []
  (println)
  (println (c/bold "# 🩺 Metabase Development Environment Doctor"))

  ;; Get mise info upfront
  (let [mise-info (get-mise-doctor-info)
        toolset (get-mise-toolset mise-info)
        project-tools (get-mise-project-tools)]

    ;; Check mise first
    (when-not mise-info
      (print-section "⚠️  mise not installed")
      (println (c/red "mise is required for managing development tools."))
      (println (str "Run " (c/green "./bin/dev-install") " to set up your environment."))
      (println)
      (u/exit 1))

    ;; Version managers
    (let [managers (detect-version-managers)]
      (print-section "Version Managers")
      (if (empty? managers)
        (println (str "- " (c/gray "None detected (using system tools)")))
        (do
          (doseq [{:keys [name]} managers]
            (println (str "- " (c/green "✓") " " name)))
          (when (> (count managers) 1)
            (println (str "- " (c/yellow "⚠") " **Warning**: Multiple version managers detected — can cause conflicts"))))))

    ;; Required tools
    (print-section "Required Tools")
    (format-check (check-git))
    (doseq [tool-cfg (:required-tools config)]
      (format-check (check-required-tool toolset tool-cfg)))

    ;; Development tools (non-mise)
    (print-section "Development Tools")
    ;; Show mise status
    (if (:activated mise-info)
      (format-check (check-result "mise" :ok (str "activated"
                                                  (when (:self_update_available mise-info)
                                                    " (update available)"))))
      (format-check (check-result "mise" :warn "not activated"
                                  :hint "Run `mise activate` in your shell")))
    (doseq [tool-cfg (:dev-tools config)]
      (format-check (check-dev-tool tool-cfg)))

    ;; Optional tools from mise
    (print-section "Optional Tools")
    (let [required-tool-names (set (map :tool (:required-tools config)))
          optional-tools (->> project-tools
                              (remove #(contains? required-tool-names %))
                              sort)]
      (if (seq optional-tools)
        (doseq [tool optional-tools]
          (format-check (check-optional-tool toolset tool)))
        (println (c/gray "- No optional tools configured in mise.toml"))))

    ;; Git status
    (print-section "Git Status")
    (format-check (check-git-branch-status))
    (format-check (check-git-status))
    (doseq [check-cfg (:conflict-checks config)]
      (format-check (check-conflict check-cfg)))

    ;; Project state
    (print-section "Project State")
    (doseq [check-cfg (:project-checks config)]
      (format-check (check-project-item check-cfg)))

    ;; Summary
    (let [all-checks (concat [(check-git)]
                             (map #(check-required-tool toolset %) (:required-tools config))
                             (map check-project-item (:project-checks config))
                             (map check-conflict (:conflict-checks config)))
          errors (filter #(= :error (:status %)) all-checks)
          warnings (filter #(= :warn (:status %)) all-checks)]
      (println)
      (cond
        (seq errors)
        (do
          (println (c/red (c/bold (str "✗ " (count errors) " error(s) found."))))
          (println (str "Run " (c/green "./bin/dev-install") " to fix most issues."))
          (u/exit 1))
        (seq warnings)
        (println (c/yellow (str "⚠ " (count warnings) " warning(s) — environment should work, but consider fixing.")))
        :else
        (println (c/green (c/bold "✓ All checks passed!")))))

    (println)
    (println (c/gray "Docs: docs/developers-guide/devenv.md"))))
