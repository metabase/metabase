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
  (let [path u/project-root-directory]
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

(defn- start-service!
  "Kill existing container and start a new one."
  [service-key suffix slot]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix) (name service-key) (when suffix (str "-" suffix)))
        port-key-src   (if (= suffix "app")
                         (:internal-ports spec)
                         (or (:wh-ports spec) (:internal-ports spec)))
        port-mappings  (mapv (fn [[pk ip]] [(port-for pk slot) ip]) port-key-src)
        cmd            (build-docker-cmd container-name (:image spec) port-mappings (:env spec))]
    (println (c/yellow "Starting " container-name "..."))
    (kill-container! container-name)
    (u/debug "Running: " (str/join " " cmd))
    (apply shell/sh cmd)
    (println (c/green "  Started ") container-name)))

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
        path    (str u/project-root-directory "/mise.local.toml")]
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

(defn- print-summary!
  "Print a summary table of ports, containers, and connection info."
  [slot {:keys [app-db with]}]
  (let [wt-name (worktree-name)
        rows    (cond-> [{:service "Jetty backend"  :port (port-for :jetty slot)        :env-var "MB_JETTY_PORT"}
                         {:service "Frontend dev"   :port (port-for :frontend-dev slot)  :env-var "MB_FRONTEND_DEV_PORT"}
                         {:service "nREPL"          :port (port-for :nrepl slot)         :env-var "NREPL_PORT"}
                         {:service "Socket REPL"    :port (port-for :socket-repl slot)   :env-var "SOCKET_REPL_PORT"}]

                  (= app-db :postgres)
                  (conj {:service "Postgres (app-db)" :port (port-for :postgres-app slot) :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mysql)
                  (conj {:service "MySQL (app-db)" :port (port-for :mysql slot) :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mariadb)
                  (conj {:service "MariaDB (app-db)" :port (port-for :mariadb slot) :env-var "MB_DB_CONNECTION_URI"})

                  (some #{:postgres} with)
                  (conj {:service "Postgres (warehouse)" :port (port-for :postgres-wh slot) :env-var ""})

                  (some #{:mysql} with)
                  (conj {:service "MySQL (warehouse)" :port (port-for :mysql slot) :env-var ""})

                  (some #{:mariadb} with)
                  (conj {:service "MariaDB (warehouse)" :port (port-for :mariadb slot) :env-var ""})

                  (some #{:mongo} with)
                  (conj {:service "MongoDB" :port (port-for :mongo slot) :env-var ""})

                  (some #{:clickhouse} with)
                  (conj {:service "ClickHouse HTTP" :port (port-for :clickhouse-http slot) :env-var ""}
                        {:service "ClickHouse native" :port (port-for :clickhouse-nat slot) :env-var ""})

                  (some #{:ldap} with)
                  (conj {:service "OpenLDAP" :port (port-for :ldap slot) :env-var ""})

                  (some #{:maildev} with)
                  (conj {:service "Maildev SMTP" :port (port-for :maildev-smtp slot) :env-var ""}
                        {:service "Maildev UI" :port (port-for :maildev-ui slot) :env-var ""}))]
    (println)
    (println (c/bold (c/green "Dev environment for ") (c/cyan wt-name) (c/green " (slot " slot ")")))
    (println)
    (t/table rows :style :unicode)
    (println)
    (println (c/cyan "Open a new shell in this worktree for mise to pick up the env vars."))
    (println (c/cyan "Tear down with: ") (c/yellow "./bin/mage -johnswanson-dev-env --down"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session layer — background process management

(defn- state-file-path []
  (str u/project-root-directory "/local/.dev-env-state.edn"))

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
  (spit (state-file-path) (pr-str state)))

(defn- delete-state-file! []
  (let [f (java.io.File. (state-file-path))]
    (when (.exists f)
      (.delete f))))

(defn- pid-alive?
  "Check if a process with the given PID is still running."
  [pid]
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "kill" "-0" (str pid))]
    (zero? exit)))

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
        proc       (apply p/process {:dir       u/project-root-directory
                                     :out       log
                                     :err       log
                                     :extra-env env-map}
                          cmd)]
    (println (c/green "Started backend") (c/cyan "(PID " (.pid (:proc proc)) ")"))
    (println (c/cyan "  Aliases: ") aliases)
    (println (c/cyan "  nREPL:   ") nrepl-port)
    (println (c/cyan "  Log:     ") (c/yellow (str "tail -f " log-file)))
    {:pid      (.pid (:proc proc))
     :log-file log-file}))

(defn- start-frontend!
  "Launch frontend dev server in background. Returns PID."
  [env-map]
  (let [log-file (str "/tmp/mb-" (worktree-name) "-frontend.log")
        log      (java.io.File. log-file)
        proc     (p/process {:dir       u/project-root-directory
                             :out       log
                             :err       log
                             :extra-env env-map}
                            "yarn" "build-hot")]
    (println (c/green "Started frontend") (c/cyan "(PID " (.pid (:proc proc)) ")"))
    (println (c/cyan "  Log:     ") (c/yellow (str "tail -f " log-file)))
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
;; Entry points

(defn- start-processes!
  "Launch backend + frontend. Updates state file with PIDs."
  [opts slot full-config]
  ;; Kill any already-running processes first
  (when-let [state (read-state-file)]
    (when-let [pid (get-in state [:backend :pid])]
      (when (pid-alive? pid)
        (kill-pid! pid "backend")))
    (when-let [pid (get-in state [:frontend :pid])]
      (when (pid-alive? pid)
        (kill-pid! pid "frontend"))))
  (println)
  (println (c/bold (c/green "Launching dev processes...")))
  (println)
  (let [env-map   (build-env slot full-config)
        backend   (start-backend! slot (:edition full-config) env-map)
        frontend  (when-not (:no-frontend opts)
                    (start-frontend! env-map))
        state     (cond-> (merge (read-state-file)
                                 {:backend backend})
                    frontend (assoc :frontend frontend))]
    (write-state-file! state)
    (println)
    (println (c/bold (c/green "Dev environment is running in the background.")))
    (println (c/cyan "Stop with: ") (c/yellow "./bin/mage -johnswanson-dev-env --down"))))

(defn- stand-up!
  "Orchestrate: prompt -> validate -> check docker -> start containers -> write toml -> optionally run."
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
        full-config (assoc config :edition edition :token token)]
    ;; Start docker containers (if needed)
    (when (or (not= (:app-db config) :h2) (seq (:with config)))
      (check-docker!))
    (when (not= (:app-db config) :h2)
      (start-service! (:app-db config) "app" slot))
    (doseq [svc (:with config)]
      (start-service! svc "wh" slot))
    ;; Write mise.local.toml
    (generate-mise-local! slot full-config)
    ;; Save config to state file
    (write-state-file! {:slot       slot
                        :config     full-config
                        :containers (collect-container-names config)})
    ;; Print summary
    (print-summary! slot config)
    ;; Optionally launch processes
    (when (:run opts)
      (start-processes! opts slot full-config))))

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
  (let [toml-path (str u/project-root-directory "/mise.local.toml")]
    (when (.exists (java.io.File. toml-path))
      (.delete (java.io.File. toml-path))
      (println (c/green "Removed " toml-path))))
  ;; Remove state file
  (delete-state-file!))

(defn- print-status!
  "Show running containers and processes for this worktree."
  []
  ;; Process status
  (when-let [state (read-state-file)]
    (println (c/bold (c/green "Processes:")))
    (println)
    (let [rows (cond-> []
                 (:backend state)
                 (conj {:process "Backend"
                        :pid     (get-in state [:backend :pid])
                        :status  (if (pid-alive? (get-in state [:backend :pid])) "running" "stopped")
                        :log     (get-in state [:backend :log-file])})

                 (:frontend state)
                 (conj {:process "Frontend"
                        :pid     (get-in state [:frontend :pid])
                        :status  (if (pid-alive? (get-in state [:frontend :pid])) "running" "stopped")
                        :log     (get-in state [:frontend :log-file])}))]
      (when (seq rows)
        (t/table rows :style :unicode)
        (println))))
  ;; Container status
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
  "Top-level dispatcher for dev-env command."
  [{:keys [options]}]
  (let [{:keys [down status]} options]
    (cond
      down   (tear-down!)
      status (print-status!)
      :else  (stand-up! options))))
