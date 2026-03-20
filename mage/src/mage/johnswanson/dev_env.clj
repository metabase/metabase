(ns mage.johnswanson.dev-env
  (:require
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

(def ^:private ^String target-project-directory
  "The project directory to target. Uses MAGE_ORIGINAL_CWD if set (for cross-worktree invocation),
   otherwise falls back to the mage source project root."
  (or (System/getenv "MAGE_ORIGINAL_CWD") u/project-root-directory))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port bases

(def ^:private port-bases
  {:jetty           3000
   :frontend-dev    8080
   :nrepl           50605
   :socket-repl     50505
   :postgres-app    15432
   :postgres-wh     25432
   :mysql           13309
   :mariadb         13306
   :mongo           37017
   :clickhouse-http 18123
   :clickhouse-nat  19000
   :ldap            11389
   :maildev-smtp    11025
   :maildev-ui      11080})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Service specs

(def ^:private service-specs
  "Map of service-key -> spec. :internal-ports is a vector of [host-key internal-port] pairs."
  {:postgres   {:image          "postgres:17"
                :internal-ports [[:postgres-app 5432]]
                :wh-ports       [[:postgres-wh 5432]]
                :env            {"POSTGRES_USER"     "metabase"
                                 "POSTGRES_DB"       "metabase"
                                 "POSTGRES_PASSWORD" "password"
                                 "PGDATA"            "/var/lib/postgresql/data"}
                :can-be-app-db? true}
   :mysql      {:image          "mysql:8.4"
                :internal-ports [[:mysql 3306]]
                :env            {"MYSQL_DATABASE"             "metabase_test"
                                 "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}
                :can-be-app-db? true}
   :mariadb    {:image          "mariadb:11"
                :internal-ports [[:mariadb 3306]]
                :env            {"MYSQL_DATABASE"             "metabase_test"
                                 "MYSQL_ALLOW_EMPTY_PASSWORD" "yes"}
                :can-be-app-db? true}
   :mongo      {:image          "mongo:8"
                :internal-ports [[:mongo 27017]]
                :env            {"MONGO_INITDB_ROOT_USERNAME" "metabase"
                                 "MONGO_INITDB_ROOT_PASSWORD" "metasample123"}}
   :clickhouse {:image          "clickhouse/clickhouse-server:latest"
                :internal-ports [[:clickhouse-http 8123] [:clickhouse-nat 9000]]
                :env            {"CLICKHOUSE_USER"     "metabase"
                                 "CLICKHOUSE_PASSWORD" "metasample123"}}
   :ldap       {:image          "bitnami/openldap:latest"
                :internal-ports [[:ldap 1389]]
                :env            {"LDAP_ADMIN_USERNAME" "admin"
                                 "LDAP_ADMIN_PASSWORD" "adminpassword"}}
   :maildev    {:image          "maildev/maildev"
                :internal-ports [[:maildev-smtp 1025] [:maildev-ui 1080]]
                :env            {}}})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Token env var mapping

(def ^:private token-env-vars
  {:all-features    "MBDEV_ALL_FEATURES_TOKEN"
   :starter-cloud   "MBDEV_STARTER_CLOUD_TOKEN"
   :pro-cloud       "MBDEV_PRO_CLOUD_TOKEN"
   :pro-self-hosted "MBDEV_PRO_SELF_HOSTED_TOKEN"})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Helpers

(defn- worktree-name
  "Last path component of the project root directory."
  []
  (let [path target-project-directory]
    (last (str/split path #"/"))))

(defn- compute-slot
  "Deterministic slot 0-99 from worktree name, or override."
  [slot-override]
  (if slot-override
    slot-override
    (mod (Math/abs (.hashCode ^String (worktree-name))) 100)))

(defn- container-prefix
  "Prefix for all docker containers for this worktree."
  []
  (str "mb-" (worktree-name) "-"))

(defn- port-for
  "Compute the port for a given service key and slot."
  [port-key slot]
  (+ (get port-bases port-key) slot))

(defn- kill-container!
  "Kill and remove a docker container (quiet, no error on missing)."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- stop-container!
  "Stop a docker container without removing it."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "stop" container-name))

(defn- check-docker!
  "Verify docker is available and the daemon is running."
  []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed. Please install Docker to use dev-env."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn- build-docker-cmd
  "Build a docker run command vector for a service."
  [container-name image port-mappings env-map]
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
;; TUI prompts

(def ^:private fzf-opts "--height=10 --layout=reverse")

(defn- select-edition
  "Prompt for edition, or return CLI-provided value."
  [opts]
  (or (some-> (:edition opts) keyword)
      (keyword (u/fzf-select! ["ee" "oss"]
                              (str fzf-opts " --prompt='Edition: '")))))

(defn- select-token
  "Prompt for token type, or return CLI-provided value."
  [opts]
  (or (some-> (:token opts) keyword)
      (keyword (u/fzf-select! ["all-features" "starter-cloud" "pro-cloud" "pro-self-hosted" "none"]
                              (str fzf-opts " --prompt='Token: '")))))

(defn- select-app-db
  "Prompt for app database, or return CLI-provided value."
  [opts]
  (or (some-> (:app-db opts) keyword)
      (keyword (u/fzf-select! ["h2" "postgres" "mysql" "mariadb"]
                              (str fzf-opts " --prompt='App database: '")))))

(defn- select-with
  "Prompt for warehouse services (multi-select), or return CLI-provided values."
  [opts]
  (if (seq (:with opts))
    (mapv keyword (:with opts))
    (let [result (u/fzf-select! ["postgres" "mysql" "mariadb" "mongo" "clickhouse" "ldap" "maildev" "(none)"]
                                (str fzf-opts " --multi --prompt='Warehouse services (TAB to select): '"))]
      (if (or (str/blank? result) (= result "(none)"))
        []
        (->> (str/split-lines result)
             (remove #(= % "(none)"))
             (mapv keyword))))))

(defn- validate-token!
  "Verify the env var for the selected token is set."
  [token]
  (when (and token (not= token :none))
    (let [env-var (get token-env-vars token)
          value   (System/getenv env-var)]
      (when (str/blank? value)
        (println (c/red "WARNING: ") (c/yellow env-var) " is not set!")
        (println "Set this env var with your " (name token) " token, or use --token none")
        (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core infra

(defn- container-state
  "Return the state of a docker container: :running, :stopped, or :not-found."
  [container-name]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true}
                                      "docker" "inspect"
                                      "--format" "{{.State.Running}}"
                                      container-name)]
    (cond
      (not (zero? exit))     :not-found
      (= (first out) "true") :running
      :else                  :stopped)))

(defn- run-container!
  "Execute `docker run -d` for a service."
  [suffix slot container-name spec]
  (let [port-key-src  (if (= suffix "app")
                        (:internal-ports spec)
                        (or (:wh-ports spec) (:internal-ports spec)))
        port-mappings (mapv (fn [[pk ip]] [(port-for pk slot) ip]) port-key-src)
        cmd           (build-docker-cmd container-name (:image spec) port-mappings (:env spec))]
    (u/debug "Running: " (str/join " " cmd))
    (apply shell/sh cmd)
    (println (c/green "  Started ") container-name)))

(defn- ensure-container!
  "Ensure a container is running. Idempotent unless fresh? is true."
  [service-key suffix slot {:keys [fresh?]}]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix) (name service-key) (when suffix (str "-" suffix)))
        current        (container-state container-name)]
    (cond
      ;; Running + no fresh: skip
      (and (= current :running) (not fresh?))
      (println (c/green "  Already running: ") container-name)

      ;; Running + fresh: nuke and recreate
      (and (= current :running) fresh?)
      (do (println (c/yellow "Recreating " container-name " (--fresh)..."))
          (kill-container! container-name)
          (run-container! suffix slot container-name spec))

      ;; Stopped + no fresh: docker start (preserves data)
      (and (= current :stopped) (not fresh?))
      (do (println (c/yellow "Restarting " container-name "..."))
          (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "start" container-name)]
            (if (zero? exit)
              (println (c/green "  Started ") container-name)
              (do (println (c/red "  Failed to restart, recreating..."))
                  (kill-container! container-name)
                  (run-container! suffix slot container-name spec)))))

      ;; Stopped + fresh, or not-found: create new
      :else
      (do (when (= current :stopped)
            (println (c/yellow "Removing old " container-name " (--fresh)..."))
            (kill-container! container-name))
          (println (c/yellow "Creating " container-name "..."))
          (run-container! suffix slot container-name spec)))
    container-name))

(defn- validate-services!
  "Validate the app-db and --with values. Returns normalized config map."
  [{:keys [app-db with]}]
  (let [valid-app-dbs #{:h2 :postgres :mysql :mariadb}
        valid-withs   #{:postgres :mysql :mariadb :mongo :clickhouse :ldap :maildev}]
    (when-not (valid-app-dbs app-db)
      (println (c/red "Invalid --app-db: " (name app-db) ". Must be one of: " (str/join ", " (map name valid-app-dbs))))
      (u/exit 1))
    (doseq [w with]
      (when-not (valid-withs w)
        (println (c/red "Invalid --with: " (name w) ". Must be one of: " (str/join ", " (map name valid-withs))))
        (u/exit 1)))
    ;; Warn if --with overlaps with --app-db
    (when (and (not= app-db :h2) (some #{app-db} with))
      (println (c/yellow "Note: --with " (name app-db) " is redundant when --app-db is " (name app-db) ". Using app-db container only.")))
    {:app-db  app-db
     :with    (if (= app-db :h2)
                with
                (vec (remove #{app-db} with)))}))

(defn- generate-mise-local!
  "Generate mise.local.toml at the project root."
  [slot {:keys [app-db edition token]}]
  (let [wt-name (worktree-name)
        lines   (cond-> ["# Auto-generated by ./bin/mage -johnswanson-dev-env"
                         (str "# Worktree: " wt-name " (slot " slot ")")
                         "# Re-run `./bin/mage -johnswanson-dev-env` to regenerate."
                         ""
                         "[env]"
                         (str "MB_JETTY_PORT = \"" (port-for :jetty slot) "\"")
                         (str "MB_FRONTEND_DEV_PORT = \"" (port-for :frontend-dev slot) "\"")
                         (str "NREPL_PORT = \"" (port-for :nrepl slot) "\"")
                         (str "SOCKET_REPL_PORT = \"" (port-for :socket-repl slot) "\"")]

                  ;; Edition
                  edition
                  (conj (str "MB_EDITION = \"" (name edition) "\""))

                  ;; EE token
                  (and (= edition :ee) token (not= token :none))
                  (conj (str "MB_PREMIUM_EMBEDDING_TOKEN = \"" (System/getenv (get token-env-vars token)) "\"")
                        "METASTORE_DEV_SERVER_URL = \"https://token-check.staging.metabase.com\"")

                  ;; Helpful test/dev flags
                  true
                  (conj "MB_ENABLE_TEST_ENDPOINTS = \"true\""
                        "MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE = \"true\"")

                  ;; App DB connection
                  (= app-db :postgres)
                  (conj "MB_DB_TYPE = \"postgres\""
                        (str "MB_DB_CONNECTION_URI = \"jdbc:postgresql://localhost:"
                             (port-for :postgres-app slot)
                             "/metabase?user=metabase&password=password\""))

                  (= app-db :mysql)
                  (conj "MB_DB_TYPE = \"mysql\""
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mysql slot)
                             "/metabase?user=root&password=\""))

                  (= app-db :mariadb)
                  (conj "MB_DB_TYPE = \"mysql\""
                        (str "MB_DB_CONNECTION_URI = \"jdbc:mysql://localhost:"
                             (port-for :mariadb slot)
                             "/metabase?user=root&password=\"")))
        content (str (str/join "\n" lines) "\n")
        path    (str target-project-directory "/mise.local.toml")]
    (spit path content)
    (println (c/green "Wrote " path))))

(defn- collect-container-names
  "Return the container names that would be created for the given config."
  [{:keys [app-db with]}]
  (cond-> []
    (not= app-db :h2)
    (conj (str (container-prefix) (name app-db) "-app"))

    true
    (into (map #(str (container-prefix) (name %) "-wh") with))))

(defn- docker-container-status
  "Query docker for container statuses. Returns {container-name status-string}."
  []
  (let [{:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" (container-prefix))
                                 "--format" "{{.Names}}\t{{.Status}}")]
    (when (seq out)
      (into {}
            (comp (remove str/blank?)
                  (map (fn [line]
                         (let [[cname status] (str/split line #"\t" 2)]
                           [cname (or status "")]))))
            out))))

(defn- service-port-str
  "Format port(s) for a service. Single port: just the number. Multiple: '1234 (http), 5678 (native)'."
  [port-pairs slot]
  (let [label {:clickhouse-http "http"
               :clickhouse-nat  "native"
               :maildev-smtp    "smtp"
               :maildev-ui      "web ui"}]
    (if (= 1 (count port-pairs))
      (str (port-for (ffirst port-pairs) slot))
      (str/join ", " (map (fn [[pk _]]
                            (let [p (port-for pk slot)]
                              (if-let [l (get label pk)]
                                (str p " (" l ")")
                                (str p))))
                          port-pairs)))))

(defn- service-display-name
  "Human-readable name for a docker service."
  [service-key suffix]
  (let [base (case service-key
               :postgres   "Postgres"
               :mysql      "MySQL"
               :mariadb    "MariaDB"
               :mongo      "MongoDB"
               :clickhouse "ClickHouse"
               :ldap       "OpenLDAP"
               :maildev    "Maildev"
               (name service-key))]
    (case suffix
      "app" (str base " (app-db)")
      "wh"  (str base " (warehouse)")
      base)))

(defn- pid-alive?
  "Check if a process with the given PID is still running."
  [pid]
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "kill" "-0" (str pid))]
    (zero? exit)))

(defn- build-status-rows
  "Build unified status table rows from config, state, and live docker status."
  [slot {:keys [app-db with]} container-statuses state]
  (let [backend-pid  (get-in state [:backend :pid])
        frontend-pid (get-in state [:frontend :pid])]
    (cond-> [{:service "Backend"     :port (str (port-for :jetty slot))
              :pid (or backend-pid "")
              :status (cond (nil? backend-pid)          ""
                            (pid-alive? backend-pid)    "running"
                            :else                       "stopped")
              :log (if backend-pid (str "tail -f " (get-in state [:backend :log-file])) "")}
             {:service "Frontend"    :port (str (port-for :frontend-dev slot))
              :pid (or frontend-pid "")
              :status (cond (nil? frontend-pid)         ""
                            (pid-alive? frontend-pid)   "running"
                            :else                       "stopped")
              :log (if frontend-pid (str "tail -f " (get-in state [:frontend :log-file])) "")}
             {:service "nREPL"       :port (str (port-for :nrepl slot))
              :pid "" :status "" :log ""}
             {:service "Socket REPL" :port (str (port-for :socket-repl slot))
              :pid "" :status "" :log ""}]

      ;; App DB container
      (not= app-db :h2)
      (conj (let [spec   (get service-specs app-db)
                  cname  (str (container-prefix) (name app-db) "-app")
                  ports  (:internal-ports spec)]
              {:service (service-display-name app-db "app")
               :port    (service-port-str ports slot)
               :status  (get container-statuses cname "")
               :pid "" :log ""}))

      ;; Warehouse services
      true
      (into (mapcat
             (fn [svc]
               (let [spec   (get service-specs svc)
                     cname  (str (container-prefix) (name svc) "-wh")
                     ports  (or (:wh-ports spec) (:internal-ports spec))]
                 [{:service (service-display-name svc "wh")
                   :port    (service-port-str ports slot)
                   :status  (get container-statuses cname "")
                   :pid "" :log ""}]))
             with)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session layer — background process management

(defn- state-file-path []
  (str target-project-directory "/local/.dev-env-state.edn"))

(defn- read-state-file
  "Read state file, return nil if missing or unreadable."
  []
  (let [path (state-file-path)]
    (when (.exists (java.io.File. path))
      (try
        (edn/read-string (slurp path))
        (catch Exception _ nil)))))

(defn- write-state-file!
  "Write state to the state file."
  [state]
  (let [f (java.io.File. (state-file-path))]
    (.mkdirs (.getParentFile f))
    (spit f (pr-str state))))

(defn- delete-state-file! []
  (let [f (java.io.File. (state-file-path))]
    (when (.exists f)
      (.delete f))))

(defn- kill-pid!
  "Kill a process by PID (SIGTERM, then SIGKILL after 5s)."
  [pid label]
  (when (pid-alive? pid)
    (println (c/yellow "Stopping " label " (PID " pid ")..."))
    (shell/sh* {:quiet? true} "kill" (str pid))
    (Thread/sleep 2000)
    (when (pid-alive? pid)
      (shell/sh* {:quiet? true} "kill" "-9" (str pid)))
    (println (c/green "  Stopped " label "."))))

(defn- build-env
  "Assemble the env map for spawning backend/frontend processes."
  [slot {:keys [app-db edition token]}]
  (cond-> {"MB_JETTY_PORT"        (str (port-for :jetty slot))
           "MB_FRONTEND_DEV_PORT" (str (port-for :frontend-dev slot))
           "NREPL_PORT"           (str (port-for :nrepl slot))
           "SOCKET_REPL_PORT"     (str (port-for :socket-repl slot))
           "MB_ENABLE_TEST_ENDPOINTS" "true"
           "MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE" "true"}

    edition
    (assoc "MB_EDITION" (name edition))

    (and (= edition :ee) token (not= token :none))
    (assoc "MB_PREMIUM_EMBEDDING_TOKEN" (System/getenv (get token-env-vars token))
           "METASTORE_DEV_SERVER_URL" "https://token-check.staging.metabase.com")

    (= app-db :postgres)
    (assoc "MB_DB_TYPE" "postgres"
           "MB_DB_CONNECTION_URI" (str "jdbc:postgresql://localhost:"
                                       (port-for :postgres-app slot)
                                       "/metabase?user=metabase&password=password"))

    (#{:mysql :mariadb} app-db)
    (assoc "MB_DB_TYPE" "mysql"
           "MB_DB_CONNECTION_URI" (str "jdbc:mysql://localhost:"
                                       (port-for (if (= app-db :mariadb) :mariadb :mysql) slot)
                                       "/metabase?user=root&password="))))

(defn- build-aliases
  "Build Clojure alias string for the backend process."
  [edition]
  (str ":dev:dev-start:drivers:drivers-dev"
       (when (= edition :ee) ":ee:ee-dev")))

(defn- start-backend!
  "Launch backend process in background. Returns PID."
  [slot edition env-map]
  (let [aliases    (build-aliases edition)
        nrepl-port (str (port-for :nrepl slot))
        log-file   (str "/tmp/mb-" (worktree-name) "-backend.log")
        cmd        ["clojure" (str "-M" aliases) "-p" nrepl-port]
        log        (java.io.File. log-file)
        proc       (apply p/process {:dir       target-project-directory
                                     :out       log
                                     :err       log
                                     :extra-env env-map}
                          cmd)]
    {:pid      (.pid (:proc proc))
     :log-file log-file}))

(defn- start-frontend!
  "Launch frontend dev server in background. Returns PID."
  [env-map]
  (let [log-file (str "/tmp/mb-" (worktree-name) "-frontend.log")
        log      (java.io.File. log-file)
        proc     (p/process {:dir       target-project-directory
                             :out       log
                             :err       log
                             :extra-env env-map}
                            "bun" "run" "build-hot")]
    {:pid      (.pid (:proc proc))
     :log-file log-file}))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Config reuse

(defn- prompt-reuse-config?
  "If a saved config exists and no CLI flags override it, ask the user whether to reuse."
  [opts]
  (let [state (read-state-file)
        has-cli-overrides? (or (:edition opts) (:token opts) (:app-db opts) (seq (:with opts)))]
    (when (and (:config state) (not has-cli-overrides?))
      (let [cfg (:config state)
            summary (str (name (:edition cfg)) " / " (name (:app-db cfg))
                         (when (seq (:with cfg))
                           (str " + " (str/join ", " (map name (:with cfg))))))]
        (= "yes"
           (u/fzf-select! ["yes" "no"]
                          (str fzf-opts " --prompt='Reuse saved config (" summary ")? '")))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Status display

(def ^:private command-prefix "./bin/mage -johnswanson-dev-env")

(defn- print-commands!
  "Print available subcommands."
  []
  (println)
  (println (c/bold "Commands:"))
  (println (c/cyan "  up     ") "Start everything (idempotent)")
  (println (c/cyan "  add    ") "Add warehouse services to running env")
  (println (c/cyan "  stop   ") "Stop processes + containers (preserves data)")
  (println (c/cyan "  down   ") "Tear down everything (removes containers and config)")
  (println (c/cyan "  status ") "Show current status")
  (println)
  (println "Run" (c/yellow (str command-prefix " <command> -h")) "for command-specific help."))

(defn- print-help!
  "Print help for a specific subcommand, or the command list if none given."
  [subcommand]
  (case subcommand
    "up"
    (do (println (c/bold "up") "- Start everything (idempotent)")
        (println)
        (println "Configures the dev environment (interactively or from saved config),")
        (println "ensures containers are running, and starts backend + frontend processes.")
        (println "Safe to run repeatedly — skips anything already running.")
        (println)
        (println (c/bold "Options:"))
        (println "  --fresh          Force-recreate containers + restart processes")
        (println "  --no-frontend    Skip frontend dev server")
        (println "  --no-backend     Skip backend process (containers + config only)")
        (println "  --edition EE     ee or oss (default: prompt)")
        (println "  --token TOKEN    Token type: all-features, starter-cloud, pro-cloud, pro-self-hosted, none")
        (println "  --app-db DB      App database: h2, postgres, mysql, mariadb (default: prompt)")
        (println "  --with SERVICE   Warehouse service (repeatable)")
        (println "  --slot SLOT      Override port slot (0-99)"))

    "add"
    (do (println (c/bold "add") "- Add warehouse services to running env")
        (println)
        (println "Adds one or more warehouse services to an already-configured environment.")
        (println "If no services are specified, prompts interactively with fzf.")
        (println)
        (println (c/bold "Usage:"))
        (println (str "  " command-prefix " add [SERVICE ...]"))
        (println)
        (println (c/bold "Services:") " postgres, mysql, mariadb, mongo, clickhouse, ldap, maildev"))

    "stop"
    (do (println (c/bold "stop") "- Stop processes and containers (preserves data)")
        (println)
        (println "Kills backend and frontend processes, stops docker containers")
        (println "without removing them. Container data is preserved, so the next")
        (println (str (c/yellow (str command-prefix " up")) " will reuse existing containers.")))

    "down"
    (do (println (c/bold "down") "- Tear down everything")
        (println)
        (println "Kills processes, removes docker containers and their data,")
        (println "deletes mise.local.toml, and clears saved configuration."))

    "status"
    (do (println (c/bold "status") "- Show current status")
        (println)
        (println "Displays running processes, container statuses, and port assignments."))

    ;; No subcommand
    (print-commands!)))

(defn- print-status!
  "Unified status display. Reads state file for config + process info, queries docker for container status."
  []
  (let [state (read-state-file)]
    (if-not (and state (:config state))
      (do (println (c/yellow "No dev environment configured yet."))
          (print-commands!))
      (let [{:keys [slot config]} state
            wt-name             (worktree-name)
            container-statuses  (docker-container-status)
            rows                (build-status-rows slot config container-statuses state)]
        ;; Header
        (println)
        (println (c/bold (c/green "Dev environment: ") (c/cyan wt-name) (c/green " (slot " slot ")")))
        ;; Unified table
        (println)
        (t/table rows :style :unicode)
        ;; Commands
        (print-commands!)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Entry points

(defn- start-processes!
  "Launch backend + frontend. Idempotent: skips if already running (unless --fresh)."
  [opts slot full-config]
  (let [state     (read-state-file)
        fresh?    (:fresh opts)
        env-map   (build-env slot full-config)
        be-pid    (get-in state [:backend :pid])
        fe-pid    (get-in state [:frontend :pid])
        be-alive? (and be-pid (pid-alive? be-pid))
        fe-alive? (and fe-pid (pid-alive? fe-pid))
        ;; Backend
        backend   (cond
                    (:no-backend opts)
                    (:backend state)

                    (and be-alive? (not fresh?))
                    (do (println (c/green "  Backend already running (PID " be-pid ")"))
                        (:backend state))

                    :else
                    (do (when be-alive? (kill-pid! be-pid "backend"))
                        (println (c/yellow "Starting backend..."))
                        (start-backend! slot (:edition full-config) env-map)))
        ;; Frontend
        frontend  (cond
                    (:no-frontend opts)
                    (:frontend state)

                    (and fe-alive? (not fresh?))
                    (do (println (c/green "  Frontend already running (PID " fe-pid ")"))
                        (:frontend state))

                    :else
                    (do (when fe-alive? (kill-pid! fe-pid "frontend"))
                        (println (c/yellow "Starting frontend..."))
                        (start-frontend! env-map)))
        new-state (cond-> (merge (read-state-file) {})
                    backend  (assoc :backend backend)
                    frontend (assoc :frontend frontend))]
    (write-state-file! new-state)))

(defn- stand-up!
  "Orchestrate: prompt -> validate -> check docker -> ensure containers -> start processes."
  [opts]
  (let [reuse?      (prompt-reuse-config? opts)
        saved       (when reuse? (:config (read-state-file)))
        edition     (or (:edition saved) (select-edition opts))
        token       (if saved
                      (:token saved)
                      (when (= edition :ee)
                        (let [t (select-token opts)]
                          (validate-token! t)
                          t)))
        app-db      (or (:app-db saved) (select-app-db opts))
        with        (or (:with saved) (select-with opts))
        slot        (compute-slot (:slot opts))
        config      (validate-services! {:app-db app-db :with with})
        full-config (assoc config :edition edition :token token)
        fresh?      (:fresh opts)]
    ;; Ensure docker containers are running
    (when (or (not= (:app-db config) :h2) (seq (:with config)))
      (check-docker!))
    (when (not= (:app-db config) :h2)
      (ensure-container! (:app-db config) "app" slot {:fresh? fresh?}))
    (doseq [svc (:with config)]
      (ensure-container! svc "wh" slot {:fresh? fresh?}))
    ;; Write mise.local.toml
    (generate-mise-local! slot full-config)
    ;; Save config to state file
    (write-state-file! {:slot       slot
                        :config     full-config
                        :containers (collect-container-names config)})
    ;; Start processes
    (start-processes! opts slot full-config)
    (print-status!)))

(defn- stop!
  "Stop processes and containers without removing them. Preserves config and state."
  []
  ;; Kill processes from state file
  (when-let [state (read-state-file)]
    (when-let [pid (get-in state [:backend :pid])]
      (kill-pid! pid "backend"))
    (when-let [pid (get-in state [:frontend :pid])]
      (kill-pid! pid "frontend")))
  ;; Stop containers (don't remove)
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}")
        containers (when (seq out)
                     (->> out
                          (remove str/blank?)
                          vec))]
    (if (seq containers)
      (do
        (println (c/yellow "Stopping containers:"))
        (doseq [cname containers]
          (println (c/yellow "  Stopping " cname))
          (stop-container! cname))
        (println (c/green "All containers stopped.")))
      (println (c/yellow "No containers found for prefix: " prefix))))
  ;; Clear process PIDs from state but keep config
  (when-let [state (read-state-file)]
    (write-state-file! (dissoc state :backend :frontend))))

(defn- tear-down!
  "Find all containers for this worktree, kill/rm them, kill processes, clean up."
  []
  ;; Kill processes from state file
  (when-let [state (read-state-file)]
    (when-let [pid (get-in state [:backend :pid])]
      (kill-pid! pid "backend"))
    (when-let [pid (get-in state [:frontend :pid])]
      (kill-pid! pid "frontend")))
  ;; Kill containers
  (check-docker!)
  (let [prefix     (container-prefix)
        {:keys [out]} (shell/sh* {:quiet? true}
                                 "docker" "ps" "-a"
                                 "--filter" (str "name=^" prefix)
                                 "--format" "{{.Names}}")
        containers (when (seq out)
                     (->> out
                          (remove str/blank?)
                          vec))]
    (if (seq containers)
      (do
        (println (c/yellow "Stopping containers:"))
        (doseq [cname containers]
          (println (c/red "  Killing " cname))
          (kill-container! cname))
        (println (c/green "All containers stopped.")))
      (println (c/yellow "No containers found for prefix: " prefix))))
  ;; Remove mise.local.toml
  (let [toml-path (str target-project-directory "/mise.local.toml")]
    (when (.exists (java.io.File. toml-path))
      (.delete (java.io.File. toml-path))
      (println (c/green "Removed " toml-path))))
  ;; Remove state file
  (delete-state-file!))

(defn- add-services!
  "Add warehouse services to an existing dev environment."
  [arguments]
  (let [state (read-state-file)]
    (when-not (and state (:config state))
      (println (c/red "No dev environment configured yet. Run `up` first."))
      (u/exit 1))
    (let [{:keys [slot config]}   state
          existing-with           (set (:with config))
          app-db                  (:app-db config)
          valid-withs             #{:postgres :mysql :mariadb :mongo :clickhouse :ldap :maildev}
          requested               (if (seq arguments)
                                    (mapv keyword arguments)
                                    (let [available (remove #(or (existing-with (keyword %))
                                                                 (= (keyword %) app-db))
                                                            ["postgres" "mysql" "mariadb" "mongo"
                                                             "clickhouse" "ldap" "maildev"])
                                          result    (u/fzf-select! (vec available)
                                                                   (str fzf-opts " --multi --prompt='Services to add (TAB to select): '"))]
                                      (if (str/blank? result)
                                        []
                                        (->> (str/split-lines result)
                                             (mapv keyword)))))]
      (when (empty? requested)
        (println (c/yellow "No services selected."))
        (u/exit 0))
      ;; Validate
      (doseq [svc requested]
        (when-not (valid-withs svc)
          (println (c/red "Invalid service: " (name svc) ". Must be one of: " (str/join ", " (map name valid-withs))))
          (u/exit 1)))
      ;; Filter out already-present and app-db overlaps
      (let [new-svcs (vec (remove #(or (existing-with %)
                                       (= % app-db))
                                  requested))]
        (doseq [svc requested]
          (when (existing-with svc)
            (println (c/yellow "  Already active: " (name svc))))
          (when (= svc app-db)
            (println (c/yellow "  Redundant with app-db: " (name svc)))))
        (when (seq new-svcs)
          (check-docker!)
          (doseq [svc new-svcs]
            (ensure-container! svc "wh" slot {:fresh? false}))
          (let [merged-with   (vec (distinct (concat (:with config) new-svcs)))
                new-config    (assoc config :with merged-with)
                new-state     (assoc state
                                     :config     new-config
                                     :containers (collect-container-names new-config))]
            (write-state-file! new-state)))
        (print-status!)))))

(defn dev-env!
  "Top-level dispatcher for dev-env command."
  [{:keys [options arguments]}]
  (if (:help options)
    (print-help! (first arguments))
    (case (first arguments)
      "up"     (stand-up! options)
      "add"    (add-services! (rest arguments))
      "stop"   (stop!)
      "down"   (tear-down!)
      "status" (print-status!)
      (print-status!))))
