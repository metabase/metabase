(ns mage.claude-env
  "Claude environment management utilities for switching between different
   Claude configurations and backing up/restoring environment state."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   [java.io File]
   [java.nio.file Files Paths StandardCopyOption]
   [java.nio.file.attribute FileAttribute]))

(set! *warn-on-reflection* true)

;; dynamic

(def ^:dynamic ^:private *dry-run*
  "Prevents actual fs changes and just prints what would happen."
  false)

(def ^:dynamic ^:private *verbose*
  "Controls verbosity of the logging output."
  false)

;; Constants

(def ^:private claude-env-dir
  "Directory name for claude environment storage."
  "claude-env")

(def ^:private claude-dir
  "Directory name for claude configuration."
  ".claude")

(def ^:private claude-md-file
  "Name of the CLAUDE.md file."
  "CLAUDE.md")

(def ^:private clojure-mcp-dir
  "Directory name for clojure-mcp configuration"
  ".clojure-mcp")

(def ^:private llm-style
  "Name of the LLM_CODE_STYLE.md file."
  "LLM_CODE_STYLE.md")

(def ^:private project-summary
  "Name of the PROJECT_SUMMARY.md file."
  "PROJECT_SUMMARY.md")

(def ^:private backup-dir
  "Directory name for backups."
  ".claude-backups")

(def ^:private state-file
  "Filename for current environment state."
  ".claude-env-state.edn")

(def ^:private file-manifest-name
  "Filename for tracking copied files in each environment."
  ".claude-env-files.edn")

(def ^:private paths-to-manage
  "List of paths that need to be handled when changing an environment."
  [claude-dir claude-md-file clojure-mcp-dir llm-style project-summary])

;; Utility functions for file operations

(defn- file-exists?
  "Check if a file or directory exists."
  [path]
  (.exists (io/file path)))

(defn- make-dirs
  "Create directories for the given path."
  [path]
  (.mkdirs (io/file path)))

(defn- list-dir
  "List contents of a directory."
  [path]
  (when (file-exists? path)
    (seq (.listFiles (io/file path)))))

(defn- directory?
  "Check if a file object or string is a directory."
  [file]
  (if (instance? File file)
    (.isDirectory file)
    (directory? (File. file))))

(defn- file-name
  "Get the name of a file."
  [file]
  (.getName file))

(defn- get-project-root
  "Get the project root directory."
  []
  (System/getProperty "user.dir"))

;; File enumeration functions

(defn- enumerate-files
  "Recursively enumerate all files in a directory.

   Args:
     path (string): Path to enumerate

   Returns:
     seq: Sequence of relative file paths"
  [path]
  (let [base-file (io/file path)]
    (when (.exists base-file)
      (if (.isDirectory base-file)
        (let [files (file-seq base-file)]
          (->> files
               (remove #(.isDirectory %))
               (map #(str/replace-first (.getPath %)
                                        (str (.getPath base-file) File/separator)
                                        ""))
               (remove empty?)))
        [(.getName base-file)]))))

(defn- save-file-manifest
  "Save a manifest of copied files for an environment.

   Args:
     env-name (string): Name of the environment
     files (seq): Sequence of file paths that were copied

   Returns:
     boolean: true if successful"
  [env-name files]
  (let [manifest-path (str (get-project-root) File/separator file-manifest-name)
        existing (try
                   (edn/read-string (slurp manifest-path))
                   (catch Exception _ {}))
        updated (assoc existing env-name (vec files))]
    (if *dry-run*
      (do (println "Would save file manifest for" env-name)
          true)
      (try
        (spit manifest-path (pr-str updated))
        true
        (catch Exception e
          (println "Error saving file manifest:" (.getMessage e))
          false)))))

(defn- load-file-manifest
  "Load the file manifest for an environment.

   Args:
     env-name (string): Name of the environment

   Returns:
     seq: Sequence of file paths, or empty seq if not found"
  [env-name]
  (let [manifest-path (str (get-project-root) File/separator file-manifest-name)]
    (if (file-exists? manifest-path)
      (try
        (let [manifest (edn/read-string (slurp manifest-path))]
          (get manifest env-name []))
        (catch Exception e
          (println "Warning: Could not load file manifest:" (.getMessage e))
          []))
      [])))

(defn- remove-from-manifest
  "Remove an environment from the file manifest.

   Args:
     env-name (string): Name of the environment to remove

   Returns:
     boolean: true if successful"
  [env-name]
  (let [manifest-path (str (get-project-root) File/separator file-manifest-name)]
    (if (file-exists? manifest-path)
      (try
        (let [manifest (edn/read-string (slurp manifest-path))
              updated (dissoc manifest env-name)]
          (if (empty? updated)
            (io/delete-file manifest-path true)
            (spit manifest-path (pr-str updated)))
          true)
        (catch Exception e
          (println "Error updating manifest:" (.getMessage e))
          false))
      true)))

;; File management functions

(defn delete-file
  "Delete a file at a path or println message when in dry-run mode

  Args:
    target-path (string): path to delete"
  [target-path]
  (if *dry-run*
    (println "Removing file from " target-path)
    (io/delete-file target-path true)))

(defn move-file
  "Move a file from one path to another or print a message when in dry-run mode

  Args:
    source-path (string): path to move file from
    dest-path (string): path to move file to"
  [source-path dest-path]
  (if *dry-run*
    (println "Moving file from" source-path "to" dest-path)
    (Files/move (Paths/get source-path (into-array String []))
                (Paths/get dest-path (into-array String []))
                (into-array [StandardCopyOption/REPLACE_EXISTING]))))

(defn copy-file
  "Copy a file from one path to another.

   Args:
     source-path (string): Source file path
     dest-path (string): Destination file path

   Returns:
     boolean: true if successful"
  [source-path dest-path]
  (if *dry-run*
    (do (println "Copying file from" source-path "to" dest-path)
        true)
    (try
      (let [source (Paths/get source-path (into-array String []))
            dest (Paths/get dest-path (into-array String []))]
        ;; Create parent directories if needed
        (when-let [parent (.getParent dest)]
          (Files/createDirectories parent (into-array FileAttribute [])))
        ;; Copy the file
        (Files/copy source dest
                    (into-array [StandardCopyOption/REPLACE_EXISTING
                                 StandardCopyOption/COPY_ATTRIBUTES]))
        true)
      (catch Exception e
        (println "Error copying file from" source-path "to" dest-path ":" (.getMessage e))
        false))))

(defn copy-directory
  "Recursively copy all files from source directory to destination.

   Args:
     source-dir (string): Source directory path
     dest-dir (string): Destination directory path

   Returns:
     seq: Sequence of copied file paths relative to dest-dir"
  [source-dir dest-dir]
  (let [copied-files (atom [])]
    (try
      (let [source-file (io/file source-dir)]
        (when (.exists source-file)
          (if (.isDirectory source-file)
            (do
              ;; Create destination directory if it doesn't exist
              (make-dirs dest-dir)
              ;; Walk through all files and copy them
              (doseq [file (file-seq source-file)
                      :when (not (.isDirectory file))]
                (let [relative-path (str/replace-first (.getPath file)
                                                       (str (.getPath source-file) File/separator)
                                                       "")
                      dest-path (str dest-dir File/separator relative-path)]
                  (when (and (not (empty? relative-path))
                             (copy-file (.getPath file) dest-path))
                    (swap! copied-files conj relative-path)))))
            ;; If source is a file, just copy it
            (when (copy-file source-dir dest-dir)
              (swap! copied-files conj (file-name source-file))))))
      @copied-files
      (catch Exception e
        (println "Error copying directory from" source-dir "to" dest-dir ":" (.getMessage e))
        @copied-files))))

(defn delete-directory
  "Recursively delete a directory and all its contents.

   Args:
     dir-path (string): Directory path to delete

   Returns:
     boolean: true if successful"
  [dir-path]
  (if *dry-run*
    (do (println "Removing directory" dir-path)
        true)
    (try
      (let [dir-file (io/file dir-path)]
        (when (.exists dir-file)
          (when (.isDirectory dir-file)
            ;; Delete all files in directory first
            (doseq [file (reverse (file-seq dir-file))]
              (.delete file)))
          ;; Delete the directory itself if it's not a directory
          (when-not (.isDirectory dir-file)
            (.delete dir-file))))
      true
      (catch Exception e
        (println "Error deleting directory" dir-path ":" (.getMessage e))
        false))))

;; Backup and restore functions

(defn- get-backup-dir
  "Get the backup directory path."
  []
  (str (get-project-root) File/separator backup-dir))

(defn- ensure-backup-dir
  "Ensure the backup directory exists."
  []
  (let [dir (get-backup-dir)]
    (when-not (file-exists? dir)
      (make-dirs dir))
    dir))

(defn create-backup-manifest
  "Create a manifest of backed up files.

   Args:
     env-name (string): Name of the environment
     files (seq): Sequence of file paths that were backed up

   Returns:
     map: Backup manifest"
  [env-name files]
  {:version "1.0"
   :timestamp (java.time.Instant/now)
   :environment env-name
   :files (vec files)
   :metadata {:user (System/getProperty "user.name")
              :host (try (.getHostName (java.net.InetAddress/getLocalHost))
                         (catch Exception _ "unknown"))}})

(defn backup-existing
  "Backup existing files/directories before copying new ones.

   Args:
     paths (seq): Sequence of paths to backup

   Returns:
     {:success boolean :manifest map}: Result with success status and manifest"
  [paths]
  (try
    (let [backup-root (ensure-backup-dir)
          timestamp (str (System/currentTimeMillis))
          backup-subdir (str backup-root File/separator timestamp)
          backed-up-files (atom [])]
      (make-dirs backup-subdir)

      (doseq [path paths]
        (when (file-exists? path)
          (let [file (io/file path)
                backup-path (str backup-subdir File/separator (.getName file))]
            (try
              (move-file path backup-path)
              (swap! backed-up-files conj {:original path :backup backup-path})
              (catch Exception e
                (println "Warning: Could not backup" path ":" (.getMessage e)))))))

      {:success true
       :manifest (create-backup-manifest "backup" @backed-up-files)
       :backup-dir backup-subdir})
    (catch Exception e
      (println "Error during backup:" (.getMessage e))
      {:success false :manifest nil})))

(defn restore-backup
  "Restore files from a backup.

   Args:
     backup-dir (string): Path to the backup directory

   Returns:
     boolean: true if successful, false otherwise"
  [backup-dir]
  (try
    (let [manifest-path (str backup-dir File/separator "manifest.edn")]
      (if (file-exists? manifest-path)
        (let [manifest (edn/read-string (slurp manifest-path))]
          (doseq [{:keys [original backup]} (:files manifest)]
            (when (file-exists? backup)
              ;; Remove any existing file at the original location
              (when (file-exists? original)
                (if (directory? original)
                  (delete-directory original)
                  (delete-file original)))
              ;; Move the backup back to original location
              (move-file backup original)))
          true)
        (do
          (println "No manifest found in backup directory:" backup-dir)
          false)))
    (catch Exception e
      (println "Error restoring backup from" backup-dir ":" (.getMessage e))
      false)))

;; Helper functions (from original implementation)

(defn get-env-dir
  "Returns the path to the claude-env directory in the project root."
  []
  (str (get-project-root) File/separator claude-env-dir))

(defn list-environments
  "Lists all available Claude environments.
   Returns a vector of environment names."
  []
  (let [env-dir (get-env-dir)]
    (if (file-exists? env-dir)
      (->> (list-dir env-dir)
           (filter directory?)
           (map file-name)
           (remove #(= % "backups"))
           (sort)
           vec)
      [])))

(defn env-exists?
  "Checks if the specified environment exists.

   Args:
     env-name (string): Name of the environment to check

   Returns:
     boolean: true if environment exists, false otherwise"
  [env-name]
  (when env-name
    (let [env-path (str (get-env-dir) File/separator env-name)]
      (and (file-exists? env-path)
           (directory? (io/file env-path))))))

(defn get-current-env
  "Reads the current environment from the state file.

   Returns:
     string: Name of current environment, or nil if none set"
  []
  (let [state-path (str (get-project-root) File/separator state-file)]
    (when (file-exists? state-path)
      (try
        (-> state-path
            slurp
            edn/read-string
            :current-environment)
        (catch Exception e
          (println "Warning: Could not read current environment state:" (.getMessage e))
          nil)))))

(defn set-current-env
  "Writes the current environment to the state file.

   Args:
     env-name (string): Name of environment to set as current

   Returns:
     boolean: true if successful, false otherwise"
  [env-name]
  (let [state-path (str (get-project-root) File/separator state-file)
        state-data {:current-environment env-name
                    :last-updated (java.util.Date.)}]
    (if *dry-run*
      (println "Setting current env...")
      (try
        (spit state-path (pr-str state-data))
        true
        (catch Exception e
          (println "Error: Could not write current environment state:" (.getMessage e))
          false)))))

;; Environment configuration helpers

(defn load-env-config
  "Loads configuration for the specified environment.

   Args:
     env-name (string): Name of environment to load

   Returns:
     map: Environment configuration or nil if not found"
  [env-name]
  (when (env-exists? env-name)
    (let [config-path (str (get-env-dir) File/separator env-name File/separator "config.edn")]
      (when (file-exists? config-path)
        (try
          (-> config-path
              slurp
              edn/read-string)
          (catch Exception e
            (println "Warning: Could not load environment config for" env-name ":" (.getMessage e))
            nil))))))

(defn save-env-config
  "Saves configuration for the specified environment.

   Args:
     env-name (string): Name of environment
     config (map): Environment configuration to save

   Returns:
     boolean: true if successful, false otherwise"
  [env-name config]
  (let [env-path (str (get-env-dir) File/separator env-name)
        config-path (str env-path File/separator "config.edn")]
    (try
      (when-not (file-exists? env-path)
        (make-dirs env-path))
      (spit config-path (pr-str config))
      true
      (catch Exception e
        (println "Error: Could not save environment config for" env-name ":" (.getMessage e))
        false))))

;; CLI Command Handlers

(defn- print-environments
  "Print a formatted list of environments."
  [envs current]
  (if (empty? envs)
    (println "No Claude environments found.")
    (do
      (println "Available Claude environments:")
      (doseq [env envs]
        (if (= env current)
          (println (str "  * " env " (active)"))
          (println (str "    " env)))))))

(defn list-command
  "List all available Claude environments.

   Args:
     options (map): Command options

   Returns:
     int: Exit code (0 for success)"
  [_options]
  (let [envs (list-environments)
        current (get-current-env)]
    (print-environments envs current)
    0))

(defn activate-command
  "Activate a Claude environment.

   Args:
     env-name (string): Name of environment to activate
     options (map): Command options including :dry-run

   Returns:
     int: Exit code (0 for success, 1 for error)"
  [env-name _options]
  (when *verbose*
    (println "Activating environment:" env-name))

  ;; Check if environment exists
  (if-not (env-exists? env-name)
    (do
      (println (str "Error: Environment '" env-name "' does not exist."))
      (println "Available environments:")
      (doseq [env (list-environments)]
        (println (str "  - " env)))
      1)

    (let [env-path (str (get-env-dir) File/separator env-name)
          project-root (get-project-root)
          all-copied-files (atom [])]

      ;; Deactivate current environment first
      (when-let [current (get-current-env)]
        (when *verbose*
          (println (str "Deactivating current environment: " current)))
        ;; Remove all files that were copied for the current environment
        (let [current-files (load-file-manifest current)]
          (doseq [file-path current-files]
            (let [full-path (str project-root File/separator file-path)]
              (when (file-exists? full-path)
                (if (directory? full-path)
                  (delete-directory full-path)
                  (delete-file full-path)))))
          (remove-from-manifest current)))

      ;; Backup existing files if needed
      (let [paths-to-check (for [path paths-to-manage]
                             (str project-root File/separator path))
            paths-to-backup (filter file-exists? paths-to-check)]
        (when (seq paths-to-backup)
          (when *verbose*
            (println "Backing up existing files..."))
          (let [{:keys [success backup-dir]} (backup-existing paths-to-backup)]
            (when (and success *verbose*)
              (println (str "Files backed up to: " backup-dir))))))

      ;; Copy files from environment to project root
      (doseq [path paths-to-manage]
        (let [source (str env-path File/separator path)
              dest (str project-root File/separator path)]
          (when (file-exists? source)
            (when *verbose*
              (println (str "Copying " path "...")))
            (if (directory? source)
              (let [copied (copy-directory source dest)]
                (swap! all-copied-files concat (map #(str path File/separator %) copied)))
              (when (copy-file source dest)
                (swap! all-copied-files conj path))))))

      ;; Save the list of copied files
      (save-file-manifest env-name @all-copied-files)

      ;; Set as current environment
      (if (or *dry-run* (seq @all-copied-files))
        (do
          (set-current-env env-name)
          (println (str "Environment '" env-name "' activated successfully."))
          0)
        (do
          (println (str "Warning: No files were copied from environment '" env-name "'."))
          (set-current-env env-name)
          0)))))

(defn deactivate-command
  "Deactivate the current Claude environment.

   Args:
     options (map): Command options

   Returns:
     int: Exit code (0 for success, 1 for error)"
  [_options]
  (let [current (get-current-env)]
    (if-not current
      (do
        (println "No environment is currently active.")
        0)
      (do
        (when *verbose*
          (println (str "Deactivating environment: " current)))
        ;; Remove all files that were copied for this environment
        (let [project-root (get-project-root)
              files-to-remove (load-file-manifest current)]
          (doseq [file-path files-to-remove]
            (let [full-path (str project-root File/separator file-path)]
              (when (file-exists? full-path)
                (when *verbose*
                  (println (str "Removing " file-path)))
                (if (directory? full-path)
                  (delete-directory full-path)
                  (delete-file full-path))))))
        ;; Remove from manifest and clear current environment
        (remove-from-manifest current)
        (set-current-env nil)
        (println (str "Environment '" current "' deactivated."))
        0))))

(defn status-command
  "Show the current Claude environment status.

   Args:
     options (map): Command options

   Returns:
     int: Exit code (0 for success)"
  [_options]
  (let [current (get-current-env)
        project-root (get-project-root)]
    (if current
      (do
        (println (str "Current environment: " current))
        (when *verbose*
          (let [config (load-env-config current)]
            (when config
              (println "\nEnvironment configuration:")
              (println (str "  Description: " (:description config)))
              (println (str "  Created: " (:created-at config)))
              (println (str "  Last used: " (:last-used config))))
            (println "\nCopied files:")
            (let [files (load-file-manifest current)]
              (if (empty? files)
                (println "  No files tracked")
                (doseq [file files]
                  (println (str "  " file)))))))
        0)
      (do
        (println "No environment is currently active.")
        (when *verbose*
          (println "\nAvailable environments:")
          (doseq [env (list-environments)]
            (println (str "  - " env))))
        0))))

(defn template-command
  "Create a new Claude environment from template.

   Args:
     options (map): Command options

   Returns:
     int: Exit code (0 for success, 1 for error)"
  [options]
  (println "Creating new environment from template...")
  (let [env-name (or (:name options)
                     (do (print "Environment name: ") (flush) (read-line)))
        description (or (:description options)
                        (do (print "Description (optional): ") (flush) (read-line)))]

    (if (env-exists? env-name)
      (do
        (println (str "Error: Environment '" env-name "' already exists."))
        1)
      (let [env-path (str (get-env-dir) File/separator env-name)
            claude-path (str env-path File/separator claude-dir)
            claude-md-path (str env-path File/separator claude-md-file)]

        ;; Create directory structure
        (make-dirs claude-path)

        ;; Create default CLAUDE.md
        (spit claude-md-path
              (str "# Claude Environment: " env-name "\n\n"
                   "## Description\n" description "\n\n"
                   "## Configuration\n"
                   "This is a Claude environment configuration file.\n"
                   "Add your project-specific instructions here.\n"))

        ;; Create default .claude directory structure
        (make-dirs (str claude-path File/separator "agents"))
        (make-dirs (str claude-path File/separator "commands"))

        ;; Save environment configuration
        (let [config {:name env-name
                      :description description
                      :created-at (java.time.Instant/now)
                      :last-used nil}]
          (save-env-config env-name config))

        (println (str "Environment '" env-name "' created successfully."))
        (println "You can now activate it with: ./bin/mage claude-env activate" env-name)
        0))))

(defn diff-command
  "Show differences between current and target environment.

   Args:
     env-name (string): Target environment to compare
     options (map): Command options

   Returns:
     int: Exit code (0 for success, 1 for error)"
  [env-name _options]
  (let [current (get-current-env)]
    (if-not current
      (do
        (println "No environment is currently active.")
        1)
      (if-not (env-exists? env-name)
        (do
          (println (str "Error: Environment '" env-name "' does not exist."))
          1)
        (do
          (println (str "Comparing current environment '" current "' with '" env-name "'..."))
          (let [current-config (load-env-config current)
                target-config (load-env-config env-name)]
            (println "\nConfiguration differences:")
            (when (not= (:description current-config) (:description target-config))
              (println "  Description differs"))
            (println "\nNote: Use a diff tool for detailed file comparisons.")
            0))))))

;; Main entry point

(defn main
  "Main entry point for the Claude environment manager.

   Args:
     parsed (map): Parsed command-line arguments from bb.edn

   Returns:
     int: Exit code"
  [{:keys [arguments options]}]
  (binding [*dry-run* (:dry-run options)
            *verbose* (:verbose options)]
    (let [[subcommand & args] arguments]
      (case subcommand
        :list (list-command options)
        :activate (if-let [env-name (first args)]
                    (activate-command env-name options)
                    (do
                      (println "Error: Environment name required for activate command")
                      1))
        :deactivate (deactivate-command options)
        :status (status-command options)
        :template (template-command options)
        :diff (if-let [env-name (first args)]
                (diff-command env-name options)
                (do
                  (println "Error: Environment name required for diff command")
                  1))))))
