(ns mage.fixbot.dev-env
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port bases (same as edpaget's dev-env)

(def ^:private port-bases
  {:jetty           3000
   :frontend-dev    8080
   :nrepl           50605
   :socket-repl     50505
   :postgres-app    15432
   :mysql           13309
   :mariadb         13306})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Service specs

(def ^:private service-specs
  {:postgres {:image          "postgres:17"
              :internal-ports [[:postgres-app 5432]]
              :env            {"POSTGRES_USER"     "metabase"
                               "POSTGRES_DB"       "metabase"
                               "POSTGRES_PASSWORD" "password"
                               "PGDATA"            "/var/lib/postgresql/data"}}
   :mysql    {:image          "mysql:8.4"
              :internal-ports [[:mysql 3306]]
              :env            {"MYSQL_DATABASE"             "metabase_test"
                               "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}}
   :mariadb  {:image          "mariadb:11"
              :internal-ports [[:mariadb 3306]]
              :env            {"MYSQL_DATABASE"             "metabase_test"
                               "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}}})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers

(defn- worktree-name
  "Last path component of the project root directory."
  []
  (last (str/split u/project-root-directory #"/")))

(defn- compute-slot
  "Deterministic slot 0-99 from worktree name, or override."
  [slot-override]
  (if slot-override
    slot-override
    (mod (Math/abs (.hashCode ^String (worktree-name))) 100)))

(defn- container-prefix []
  (str "mb-" (worktree-name) "-"))

(defn- port-for [port-key slot]
  (+ (get port-bases port-key) slot))

(defn- kill-container! [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- check-docker! []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed. Please install Docker to use dev-env."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn- build-docker-cmd [container-name image port-mappings env-map]
  (into ["docker" "run" "-d"]
        (concat
         (mapcat (fn [[host-port internal-port]]
                   ["-p" (str host-port ":" internal-port)])
                 port-mappings)
         (mapcat (fn [[k v]]
                   ["-e" (str k "=" v)])
                 env-map)
         ["--name" container-name
          image])))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core

(defn- start-service! [service-key slot]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix) (name service-key) "-app")
        port-mappings  (mapv (fn [[pk ip]] [(port-for pk slot) ip])
                             (:internal-ports spec))
        cmd            (build-docker-cmd container-name (:image spec) port-mappings (:env spec))]
    (println (c/yellow "Starting " container-name "..."))
    (kill-container! container-name)
    (u/debug "Running: " (str/join " " cmd))
    (apply shell/sh cmd)
    (println (c/green "  Started ") container-name)))

(defn- validate-app-db! [app-db]
  (let [app-db-kw (keyword app-db)
        valid-dbs #{:h2 :postgres :mysql :mariadb}]
    (when-not (valid-dbs app-db-kw)
      (println (c/red "Invalid --app-db: " app-db ". Must be one of: " (str/join ", " (map name valid-dbs))))
      (u/exit 1))
    app-db-kw))

(def ^:private config-file-content
  "version: 1
config:
  users:
    - first_name: Admin
      last_name: User
      password: S0v^S$BIteM9NL
      email: admin@example.com
      is_superuser: true
    - first_name: Regular
      last_name: User
      password: q5bdJ5A3%Dh@&u75
      email: regular@example.com
      is_superuser: false
  api-keys:
    - name: \"Admin API key\"
      group: admin
      description: \"API key with admin permissions.\"
      creator: admin@example.com
      key: mb_AdminApiKey
    - name: \"Regular API key\"
      group: all-users
      description: \"API key with regular permissions.\"
      creator: admin@example.com
      key: mb_RegularApiKey
")

(defn- write-config-file!
  "Write the Metabase config file for auto-setup of users and API keys."
  []
  (let [path (str u/project-root-directory "/metabase.config.yml")]
    (spit path config-file-content)
    (println (c/green "Wrote " path))))

(defn- generate-mise-local! [slot app-db-kw]
  (let [wt-name (worktree-name)
        config-path (str u/project-root-directory "/metabase.config.yml")
        ;; Services run inside a container — use fixed base ports.
        ;; Only the DB port needs slot-based allocation (it runs on the host).
        lines   (cond-> [(str "# Auto-generated by ./bin/mage -fixbot-dev-env")
                         (str "# Worktree: " wt-name " (slot " slot ")")
                         (str "# Re-run `./bin/mage -fixbot-dev-env` to regenerate.")
                         ""
                         "[env]"
                         (str "MB_CONFIG_FILE_PATH = \"" config-path "\"")
                         "MB_EDITION = \"ee\""
                         "DISABLE_BUILD_NOTIFICATIONS = \"1\""
                         (str "MB_PREMIUM_EMBEDDING_TOKEN = \"" (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly "")) "\"")
                         (str "LINEAR_API_KEY = \"" (u/env "LINEAR_API_KEY" (constantly "")) "\"")
                         (str "MB_JETTY_PORT = \"" (get port-bases :jetty) "\"")
                         (str "MB_FRONTEND_DEV_PORT = \"" (get port-bases :frontend-dev) "\"")
                         (str "NREPL_PORT = \"" (get port-bases :nrepl) "\"")
                         (str "SOCKET_REPL_PORT = \"" (get port-bases :socket-repl) "\"")]
                  (= app-db-kw :postgres)
                  (conj (str "MB_DB_TYPE = \"postgres\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:postgresql://localhost:"
                             (port-for :postgres-app slot)
                             "/metabase?user=metabase&password=password\""))
                  (= app-db-kw :mysql)
                  (conj (str "MB_DB_TYPE = \"mysql\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mysql slot)
                             "/metabase?user=root&password=\""))
                  (= app-db-kw :mariadb)
                  (conj (str "MB_DB_TYPE = \"mysql\"")
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mariadb slot)
                             "/metabase?user=root&password=\"")))
        content (str (str/join "\n" lines) "\n")
        path    (str u/project-root-directory "/mise.local.toml")]
    (spit path content)
    (println (c/green "Wrote " path))))

(defn- write-status-file!
  "Write initial LLM status to the fixbot status pane.
   The status watch renders issue info and health separately;
   this file only contains the agent's status message."
  [_slot _app-db-kw]
  (let [dir  (str u/project-root-directory "/.fixbot")
        _    (.mkdirs (java.io.File. dir))
        path (str dir "/llm-status.txt")]
    (spit path "Booting up...")
    (println (c/green "Wrote " path))))

(defn- print-summary! [slot app-db-kw]
  (let [wt-name (worktree-name)
        rows    (cond-> [{:service "Jetty backend"  :port (get port-bases :jetty)        :env-var "MB_JETTY_PORT"}
                         {:service "Frontend dev"   :port (get port-bases :frontend-dev)  :env-var "MB_FRONTEND_DEV_PORT"}
                         {:service "nREPL"          :port (get port-bases :nrepl)         :env-var "NREPL_PORT"}
                         {:service "Socket REPL"    :port (get port-bases :socket-repl)   :env-var "SOCKET_REPL_PORT"}]
                  (= app-db-kw :postgres)
                  (conj {:service "Postgres (app-db)" :port (port-for :postgres-app slot) :env-var "MB_DB_CONNECTION_URI"})
                  (= app-db-kw :mysql)
                  (conj {:service "MySQL (app-db)" :port (port-for :mysql slot) :env-var "MB_DB_CONNECTION_URI"})
                  (= app-db-kw :mariadb)
                  (conj {:service "MariaDB (app-db)" :port (port-for :mariadb slot) :env-var "MB_DB_CONNECTION_URI"}))]
    (println)
    (println (c/bold (c/green "Fixbot dev environment for ") (c/cyan wt-name) (c/green " (slot " slot ")")))
    (println)
    (t/table rows :style :unicode)
    (println)
    (println (c/cyan "Tear down with: ") (c/yellow "./bin/mage -fixbot-dev-env --down"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Entry points

(defn- stand-up! [opts]
  (let [slot      (compute-slot (:slot opts))
        app-db-kw (validate-app-db! (:app-db opts))]
    (check-docker!)
    (when (not= app-db-kw :h2)
      (start-service! app-db-kw slot))
    (write-config-file!)
    (generate-mise-local! slot app-db-kw)
    (write-status-file! slot app-db-kw)
    (print-summary! slot app-db-kw)))

(defn- tear-down! []
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}")
        containers (when (seq out)
                     (->> out (remove str/blank?) vec))]
    (if (seq containers)
      (do
        (println (c/yellow "Stopping containers:"))
        (doseq [cname containers]
          (println (c/red "  Killing " cname))
          (kill-container! cname))
        (println (c/green "All containers stopped.")))
      (println (c/yellow "No containers found for prefix: " prefix)))
    (let [toml-path (str u/project-root-directory "/mise.local.toml")]
      (when (.exists (java.io.File. toml-path))
        (.delete (java.io.File. toml-path))
        (println (c/green "Removed " toml-path))))
    (let [config-path (str u/project-root-directory "/metabase.config.yml")]
      (when (.exists (java.io.File. config-path))
        (.delete (java.io.File. config-path))
        (println (c/green "Removed " config-path))))
    (let [fixbot-dir (str u/project-root-directory "/.fixbot")]
      (when (.isDirectory (java.io.File. fixbot-dir))
        (doseq [f (.listFiles (java.io.File. fixbot-dir))]
          (.delete ^java.io.File f))
        (.delete (java.io.File. fixbot-dir))
        (println (c/green "Removed " fixbot-dir))))))

(defn- print-status! []
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}\t{{.Status}}\t{{.Ports}}")
        lines      (when (seq out)
                     (->> out (remove str/blank?) vec))]
    (if (seq lines)
      (let [rows (mapv (fn [line]
                         (let [[cname status ports] (str/split line #"\t" 3)]
                           {:container cname
                            :status    (or status "")
                            :ports     (or ports "")}))
                       lines)]
        (println (c/bold (c/green "Containers for " (worktree-name) ":")))
        (println)
        (t/table rows :style :unicode))
      (println (c/yellow "No containers found for " (worktree-name))))))

(defn dev-env!
  "Top-level dispatcher for fixbot dev-env command."
  [{:keys [options]}]
  (let [{:keys [down status]} options]
    (cond
      down   (tear-down!)
      status (print-status!)
      :else  (stand-up! (update options :app-db #(or % "postgres"))))))
