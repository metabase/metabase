(ns mage.bot.setup-worktree
  (:require
   [babashka.fs :as fs]
   [babashka.pods :as pods]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]))

(pods/load-pod 'org.babashka/postgresql "0.1.0")
(require '[pod.babashka.postgresql :as pg])

(set! *warn-on-reflection* true)

(defn- worktree-name [worktree-root]
  (last (str/split worktree-root #"/")))

(defn- main-worktree-path
  "Return the path of the main (original) git worktree."
  []
  (let [{:keys [out]} (shell/sh* {:quiet? true} "git" "worktree" "list" "--porcelain")]
    (->> out
         (take-while #(not (str/blank? %)))
         (filter #(str/starts-with? % "worktree "))
         first
         (#(subs % (count "worktree "))))))

(defn- copy-file!
  "Copy a single file from main worktree to new worktree. Skips if source doesn't exist."
  [main-path worktree-root relative-path]
  (let [src  (str main-path "/" relative-path)
        dest (str worktree-root "/" relative-path)]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping " relative-path " (not found in main repo)"))
      (do
        (fs/create-dirs (str (fs/parent dest)))
        (fs/copy src dest {:replace-existing true})
        (println (c/green "Copied " relative-path))))))

(defn- create-symlink!
  "Create a symlink from main worktree to new worktree for a single path."
  [main-path worktree-root relative-path]
  (let [src  (str main-path "/" relative-path)
        dest (str worktree-root "/" relative-path)]
    ;; Create source dir if it doesn't exist (e.g., jars/)
    (when (and (not (fs/exists? src)) (not (str/includes? relative-path ".")))
      (fs/create-dirs src))
    (cond
      (not (fs/exists? src))
      (println (c/yellow "Skipping " relative-path " symlink: not found"))

      (and (fs/exists? dest {:nofollow-links true}) (not (fs/sym-link? dest)))
      (println (c/yellow "Skipping " relative-path " symlink: already exists and is not a symlink"))

      :else
      (do
        (when (fs/sym-link? dest) (fs/delete dest))
        (fs/create-sym-link dest src)
        (println (c/green "Symlinked " relative-path))))))

(defn- copy-tree-if-exists!
  "Copy a directory tree from main to worktree. Tries APFS copy-on-write
   (`cp -rc`) first; on non-APFS filesystems (including Linux) falls back
   to a regular recursive copy. Replaces existing destination. Skips if
   source doesn't exist."
  [main-path worktree-root relative-path]
  (let [src  (str main-path "/" relative-path)
        dest (str worktree-root "/" relative-path)]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping " relative-path " copy: not found"))
      (do
        (when (fs/exists? dest {:nofollow-links true})
          (fs/delete-tree dest))
        (let [{:keys [exit]} (shell/sh* {:quiet? true} "cp" "-rc" src dest)]
          (if (zero? exit)
            (println (c/green "Copied " relative-path " (copy-on-write)"))
            (let [{:keys [exit err]} (shell/sh* {:quiet? true} "cp" "-r" src dest)]
              (if (zero? exit)
                (println (c/green "Copied " relative-path))
                (do (println (c/red "Failed to copy " relative-path ":"))
                    (doseq [line err] (println (c/red "  " line))))))))))))

(defn- copy-files!
  "Copy individual files from main worktree to new worktree."
  [main-path worktree-root]
  (doseq [path [".env" ".lein-env" ".mcp.json" ".claude/settings.local.json"]]
    (copy-file! main-path worktree-root path)))

(defn- copy-dirs!
  "Copy directory trees (APFS copy-on-write) from main worktree to new worktree."
  [main-path worktree-root]
  (doseq [path [".cpcache" ".clj-kondo/.cache" ".shadow-cljs" "plugins" "local"]]
    (copy-tree-if-exists! main-path worktree-root path)))

(defn- create-symlinks!
  "Create symlinks from main worktree to new worktree."
  [main-path worktree-root]
  (doseq [path ["bin/bb" "jars"]]
    (create-symlink! main-path worktree-root path)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; IntelliJ / IDE setup

(defn- copy-idea-files!
  "Copy .idea/ and *.iml files, renaming .iml to match the worktree name."
  [main-path worktree-root]
  (let [main-name (worktree-name main-path)
        wt-name   (worktree-name worktree-root)]
    ;; Copy .idea directory
    (copy-tree-if-exists! main-path worktree-root ".idea")
    ;; Copy and rename .iml files
    (doseq [iml (fs/glob main-path "*.iml")]
      (let [old-name (str (fs/file-name iml))
            new-name (str/replace old-name main-name wt-name)
            dest     (str worktree-root "/" new-name)]
        (fs/copy iml dest {:replace-existing true})
        (println (c/green "Copied " old-name " -> " new-name))))
    ;; Update modules.xml to reference the renamed .iml file
    (let [modules-xml (io/file worktree-root ".idea/modules.xml")]
      (when (.exists modules-xml)
        (let [content (slurp modules-xml)
              updated (str/replace content (str main-name ".iml") (str wt-name ".iml"))]
          (when (not= content updated)
            (spit modules-xml updated)
            (println (c/green "Updated modules.xml: " main-name ".iml -> " wt-name ".iml"))))))))

(defn- update-workspace-paths!
  "Replace absolute main-worktree paths with new worktree paths in workspace.xml."
  [main-path worktree-root]
  (let [workspace (io/file worktree-root ".idea/workspace.xml")]
    (when (.exists workspace)
      (let [content (slurp workspace)
            updated (str/replace content main-path worktree-root)]
        (when (not= content updated)
          (spit workspace updated)
          (println (c/green "Updated workspace.xml paths")))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Database and dev environment

(defn- create-postgres-db!
  "Create the worktree's database in the local PostgreSQL instance if it doesn't already exist."
  [worktree-root]
  (let [wt-name  (worktree-name worktree-root)
        db-name  (str/replace wt-name #"[^a-zA-Z0-9_]" "_")
        db-spec  {:dbtype "postgresql" :host "localhost" :port 5432
                  :dbname "metabase" :user "metabase" :password "password"}]
    (try
      (pg/execute! db-spec [(str "CREATE DATABASE \"" db-name "\"")])
      (println (c/green "Created postgres database: ") db-name)
      (catch Exception e
        (cond
          (str/includes? (ex-message e) "already exists")
          (println (c/green "Postgres database already exists: ") db-name)

          :else
          (do
            (println (c/red "Failed to create postgres database '" db-name "': ") (ex-message e))
            (println (c/yellow "Expected a local Postgres on localhost:5432 with user=metabase password=password."))
            (println (c/yellow "Adjust your local Postgres or set up the metabase user/password to match."))
            (throw e)))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Main entry point

(defn setup-worktree!
  "Run final configuration steps after a new worktree is created."
  [{:keys [options]}]
  (let [worktree-root (or (:worktree options)
                          (do (println (c/red "Usage: ./bin/mage -bot-setup-worktree --worktree <path-to-worktree>"))
                              (System/exit 1)))
        main-path     (main-worktree-path)]
    (println (c/bold (c/green "Setting up worktree: ") (c/cyan (worktree-name worktree-root))))
    (println)
    (println (c/cyan "Main repo: ") main-path)
    (println)
    (create-symlinks! main-path worktree-root)
    (copy-dirs! main-path worktree-root)
    (copy-files! main-path worktree-root)
    (copy-idea-files! main-path worktree-root)
    (update-workspace-paths! main-path worktree-root)
    (create-postgres-db! worktree-root)
    (println)
    (println (c/green "Done."))
    (println (c/cyan "Run ./bin/mage -bot-dev-env to configure the dev environment."))))
