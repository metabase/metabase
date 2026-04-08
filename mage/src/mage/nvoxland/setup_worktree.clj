(ns mage.nvoxland.setup-worktree
  (:require
   [babashka.fs :as fs]
   [babashka.pods :as pods]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.nvoxland.dev-env :as dev-env]
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

(defn- symlink-node-modules!
  "Symlink node_modules from the main worktree into this worktree."
  [main-path worktree-root]
  (let [src  (str main-path "/node_modules")
        dest (str worktree-root "/node_modules")]
    (cond
      (not (fs/exists? src))
      (println (c/yellow "Skipping node_modules symlink: " src " does not exist"))

      (and (fs/exists? dest {:nofollow-links true}) (not (fs/sym-link? dest)))
      (println (c/yellow "Skipping node_modules symlink: " dest " already exists and is not a symlink"))

      :else
      (do
        (when (fs/sym-link? dest)
          (fs/delete dest))
        (fs/create-sym-link dest src)
        (println (c/green "Symlinked node_modules from " src))))))

(defn- symlink-bb!
  "Symlink bin/bb from the main worktree into this worktree so bin/mage works without re-downloading."
  [main-path worktree-root]
  (let [src  (str main-path "/bin/bb")
        dest (str worktree-root "/bin/bb")]
    (cond
      (not (fs/exists? src))
      (println (c/yellow "Skipping bin/bb symlink: " src " does not exist"))

      (and (fs/exists? dest {:nofollow-links true}) (not (fs/sym-link? dest)))
      (println (c/yellow "Skipping bin/bb symlink: " dest " already exists and is not a symlink"))

      :else
      (do
        (when (fs/sym-link? dest)
          (fs/delete dest))
        (fs/create-sym-link dest src)
        (println (c/green "Symlinked bin/bb from " src))))))

(defn- symlink-cpcache!
  "Symlink .cpcache from the main worktree into this worktree."
  [main-path worktree-root]
  (let [src  (str main-path "/.cpcache")
        dest (str worktree-root "/.cpcache")]
    (cond
      (not (fs/exists? src))
      (println (c/yellow "Skipping .cpcache symlink: " src " does not exist"))

      (and (fs/exists? dest {:nofollow-links true}) (not (fs/sym-link? dest)))
      (println (c/yellow "Skipping .cpcache symlink: " dest " already exists and is not a symlink"))

      :else
      (do
        (when (fs/sym-link? dest)
          (fs/delete dest))
        (fs/create-sym-link dest src)
        (println (c/green "Symlinked .cpcache from " src))))))

(defn- symlink-jars!
  "Symlink jars/ from the main worktree into this worktree, creating jars/ in the main worktree if needed."
  [main-path worktree-root]
  (let [src  (str main-path "/jars")
        dest (str worktree-root "/jars")]
    (when-not (fs/exists? src)
      (fs/create-dirs src)
      (println (c/green "Created jars/ in main worktree")))
    (cond
      (and (fs/exists? dest {:nofollow-links true}) (not (fs/sym-link? dest)))
      (println (c/yellow "Skipping jars symlink: " dest " already exists and is not a symlink"))

      :else
      (do
        (when (fs/sym-link? dest)
          (fs/delete dest))
        (fs/create-sym-link dest src)
        (println (c/green "Symlinked jars from " src))))))

(defn- copy-shadow-cljs!
  "Copy .shadow-cljs from the main worktree (not symlinked — parallel builds need isolated state)."
  [main-path worktree-root]
  (let [src  (str main-path "/.shadow-cljs")
        dest (str worktree-root "/.shadow-cljs")]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping .shadow-cljs copy: " src " does not exist"))
      (do
        (when (fs/exists? dest {:nofollow-links true})
          (fs/delete-tree dest))
        (fs/copy-tree src dest)
        (println (c/green "Copied .shadow-cljs from " src))))))

(defn- copy-plugins!
  "Copy plugins/ from the main worktree (not symlinked — worktrees may have different driver versions)."
  [main-path worktree-root]
  (let [src  (str main-path "/plugins")
        dest (str worktree-root "/plugins")]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping plugins copy: " src " does not exist"))
      (do
        (when (fs/exists? dest {:nofollow-links true})
          (fs/delete-tree dest))
        (fs/copy-tree src dest)
        (println (c/green "Copied plugins from " src))))))

(defn- copy-dot-env!
  "Copy .env from the main worktree into this worktree (gitignored personal config)."
  [main-path worktree-root]
  (let [src  (str main-path "/.env")
        dest (str worktree-root "/.env")]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping .env copy: " src " does not exist"))
      (do
        (fs/copy src dest {:replace-existing true})
        (println (c/green "Copied .env from " src))))))

(defn- copy-local!
  "Copy the local/ directory from the main worktree into this worktree."
  [main-path worktree-root]
  (let [src  (str main-path "/local")
        dest (str worktree-root "/local")]
    (if-not (fs/exists? src)
      (println (c/yellow "Skipping local/ copy: " src " does not exist"))
      (do
        (fs/create-dirs dest)
        (doseq [f (fs/list-dir src)]
          (let [fname (fs/file-name f)
                fdest (str dest "/" fname)]
            (when-not (fs/exists? fdest)
              (fs/copy f fdest)
              (println (c/green "Copied local/" fname)))))))))

(defn- update-workspace-paths!
  "After copying .idea/, replace absolute paths from the main worktree with the new
  worktree path in workspace.xml (Copilot persistence, last opened file, TS lib path, etc.)."
  [main-path worktree-root]
  (let [workspace (clojure.java.io/file worktree-root ".idea/workspace.xml")]
    (when (.exists workspace)
      (let [content (slurp workspace)
            updated (str/replace content main-path worktree-root)]
        (when (not= content updated)
          (spit workspace updated)
          (println (c/green "Updated workspace.xml: paths " main-path " -> " worktree-root)))))))

(defn- create-postgres-db!
  "Create the worktree's database in the local PostgreSQL instance if it doesn't already exist."
  [worktree-root]
  (let [wt-name  (last (str/split worktree-root #"/"))
        db-name  (str/replace wt-name #"[^a-zA-Z0-9_]" "_")
        db-spec  {:dbtype "postgresql" :host "localhost" :port 5432
                  :dbname "metabase" :user "metabase" :password "password"}
        exists?  (-> (pg/execute! db-spec
                                  ["SELECT 1 FROM pg_database WHERE datname = ?" db-name])
                     seq
                     boolean)]
    (if exists?
      (println (c/green "Postgres database already exists: ") db-name)
      (do
        (pg/execute! db-spec [(str "CREATE DATABASE \"" db-name "\"")])
        (println (c/green "Created postgres database: ") db-name)))))

(defn- configure-dev-env!
  "Configure dev environment in the target worktree (ee/all-features/postgres, no processes started)."
  [worktree-root]
  (println (c/cyan "Configuring dev environment..."))
  (dev-env/dev-env! {:options {:edition  "ee"
                               :token    "all-features"
                               :app-db   "postgres"
                               :with     []
                               :worktree worktree-root}}))

(defn- copy-idea-files!
  "Copy .idea directory and *.iml files from the main worktree into this worktree."
  [main-path worktree-root]
  (let [idea-src  (str main-path "/.idea")
        idea-dest (str worktree-root "/.idea")]
    (if (fs/exists? idea-src)
      (do
        (when (fs/exists? idea-dest)
          (fs/delete-tree idea-dest))
        (fs/copy-tree idea-src idea-dest)
        (println (c/green "Copied .idea from " idea-src)))
      (println (c/yellow "Skipping .idea copy: " idea-src " does not exist"))))
  (doseq [iml (fs/glob main-path "*.iml")]
    (let [dest (str worktree-root "/" (fs/file-name iml))]
      (fs/copy iml dest {:replace-existing true})
      (println (c/green "Copied " (fs/file-name iml))))))

(defn setup-worktree!
  "Run final configuration steps after a new worktree is created."
  [{:keys [options]}]
  (let [worktree-root (or (:worktree options)
                          (do (println (c/red "Usage: ./bin/mage -nvoxland-setup-worktree --worktree <path-to-worktree>"))
                              (System/exit 1)))
        main-path     (main-worktree-path)]
    (println (c/bold (c/green "Setting up worktree: ") (c/cyan (worktree-name worktree-root))))
    (println)
    (println (c/cyan "Main rep: ") main-path)
    (println)
    (symlink-node-modules! main-path worktree-root)
    (symlink-bb! main-path worktree-root)
    (symlink-cpcache! main-path worktree-root)
    (symlink-jars! main-path worktree-root)
    (copy-shadow-cljs! main-path worktree-root)
    (copy-plugins! main-path worktree-root)
    (copy-dot-env! main-path worktree-root)
    (copy-local! main-path worktree-root)
    (copy-idea-files! main-path worktree-root)
    (update-workspace-paths! main-path worktree-root)
    (create-postgres-db! worktree-root)
    (configure-dev-env! worktree-root)
    (println)
    (println (c/green "Done."))))
