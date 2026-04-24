(ns mage.nvoxland.dev-env
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.nvoxland.env :as bot-env]
   [mage.shell :as shell]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

(def ^:private root-override (atom nil))

(defn- root [] (or @root-override u/project-root-directory))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Port allocation & Docker infrastructure

(def port-bases
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

(def service-specs
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

(def shared-db-services
  "Services that use a shared local instance rather than a per-worktree Docker container."
  #{:postgres :mysql :mariadb :mongo})

(def bot-dirs
  "Bot-specific directories to create under .bot/ in the worktree."
  {"cibot"    [".bot/cibot"]
   "fixbot"   [".bot/fixbot/playwright/sessions" ".bot/fixbot/playwright/sockets"]
   "qabot"    [".bot/qabot"]
   "reprobot" [".bot/reprobot"]
   "uxbot"    [".bot/uxbot/screenshots"]})

(defn worktree-name
  "Last path component of the given root directory."
  [root-dir]
  (last (str/split root-dir #"/")))

(defn db-name
  "Database name for this worktree: worktree name with non-alphanumeric chars replaced by _."
  [root-dir]
  (str/replace (worktree-name root-dir) #"[^a-zA-Z0-9_]" "_"))

(defn compute-slot
  "Deterministic slot 0-99 from worktree name, or override."
  [root-dir slot-override]
  (if slot-override
    slot-override
    (mod (Math/abs (.hashCode ^String (worktree-name root-dir))) 100)))

(defn container-prefix
  "Prefix for all docker containers for this worktree."
  [root-dir]
  (str "mb-" (worktree-name root-dir) "-"))

(defn port-for
  "Compute the port for a given service key and slot."
  [port-key slot]
  (+ (get port-bases port-key) slot))

(defn check-docker!
  "Verify docker is available and the daemon is running."
  []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed. Please install Docker to use dev-env."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn- kill-container!
  "Kill and remove a docker container (quiet, no error on missing)."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

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

(defn start-service!
  "Kill existing container and start a new one.
   suffix is typically \"app\" or \"wh\" (warehouse)."
  [root-dir service-key suffix slot]
  (let [spec           (get service-specs service-key)
        container-name (str (container-prefix root-dir) (name service-key) (when suffix (str "-" suffix)))
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

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Incremental mise.local.toml updates

(defn- update-mise-local!
  "Incrementally update mise.local.toml [env] section. Merges `env-pairs` (a map of
   {\"KEY\" \"value\"}) into the existing file, preserving keys not in `env-pairs`.
   Creates the file if it doesn't exist. Optionally prepends `header-lines` (comment strings)."
  ([root-dir env-pairs]
   (update-mise-local! root-dir env-pairs nil))
  ([root-dir env-pairs header-lines]
   (let [path     (str root-dir "/mise.local.toml")
         existing (or (bot-env/read-mise-local-toml root-dir) {})
         merged   (merge existing env-pairs)
         lines    (cond-> []
                    (seq header-lines)
                    (into header-lines)
                    (seq header-lines)
                    (conj "")
                    true
                    (conj "[env]")
                    true
                    (into (map (fn [[k v]] (str k " = \"" v "\""))
                               (sort-by key merged))))]
     (spit path (str (str/join "\n" lines) "\n")))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Token env var mapping

(def ^:private token-env-vars
  {:all-features    "MBDEV_ALL_FEATURES_TOKEN"
   :starter-cloud   "MBDEV_STARTER_CLOUD_TOKEN"
   :pro-cloud       "MBDEV_PRO_CLOUD_TOKEN"
   :pro-self-hosted "MBDEV_PRO_SELF_HOSTED_TOKEN"})

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
  "Prompt for warehouse services (multi-select), or return CLI-provided values.
  nil means not specified (prompt); [] means explicitly none (skip prompt)."
  [opts]
  (if (some? (:with opts))
    (mapv keyword (:with opts))
    (let [result (u/fzf-select! ["postgres" "mysql" "mariadb" "mongo" "clickhouse" "ldap" "maildev" "(none)"]
                                (str fzf-opts " --multi --prompt='Warehouse services (TAB to select): '"))]
      (if (or (str/blank? result) (= result "(none)"))
        []
        (->> (str/split-lines result)
             (remove #(= % "(none)"))
             (mapv keyword))))))

(defn- resolve-token-value
  "Get the actual token string for the given token type."
  [token]
  (bot-env/resolve-env (get token-env-vars token) (root)))

(defn- validate-token!
  "Verify the token value is available (from env var or mise.local.toml)."
  [token]
  (when (and token (not= token :none))
    (when (str/blank? (resolve-token-value token))
      (let [env-var (get token-env-vars token)]
        (println (c/red "WARNING: ") (c/yellow env-var) " is not set in your environment!")
        (println "Set " env-var " with your " (name token) " token, or use --token none")
        (u/exit 1)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Core infra

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
  "Incrementally update mise.local.toml with dev-env configuration.
   Preserves existing keys not being set. When bot-name is provided,
   uses Docker-based ports; otherwise uses shared local DB instances."
  [slot {:keys [app-db edition token bot-name]}]
  (let [wt-name    (worktree-name (root))
        bot-mode?  (some? bot-name)
        env-pairs  (cond-> {"MB_JETTY_PORT"        (str (port-for :jetty slot))
                            "MB_FRONTEND_DEV_PORT" (str (port-for :frontend-dev slot))
                            "NREPL_PORT"           (str (port-for :nrepl slot))
                            "SOCKET_REPL_PORT"     (str (port-for :socket-repl slot))
                            "MB_ENABLE_TEST_ENDPOINTS" "true"
                            "MB_DANGEROUS_UNSAFE_ENABLE_TESTING_H2_CONNECTIONS_DO_NOT_ENABLE" "true"}

                     ;; Edition
                     edition
                     (assoc "MB_EDITION" (name edition))

                     ;; EE token
                     (and (= edition :ee) token (not= token :none))
                     (assoc "MB_PREMIUM_EMBEDDING_TOKEN" (resolve-token-value token)
                            "METASTORE_DEV_SERVER_URL" "https://token-check.staging.metabase.com")

                     ;; App DB — bot mode uses Docker containers with slot-based ports
                     (and bot-mode? (= app-db :postgres))
                     (assoc "MB_DB_TYPE" "postgres"
                            "MB_DB_CONNECTION_URI"
                            (str "jdbc:postgresql://localhost:" (port-for :postgres-app slot)
                                 "/metabase?user=metabase&password=password"))

                     (and bot-mode? (#{:mysql :mariadb} app-db))
                     (assoc "MB_DB_TYPE" "mysql"
                            "MB_DB_CONNECTION_URI"
                            (str "jdbc:mysql://localhost:"
                                 (port-for (if (= app-db :mysql) :mysql :mariadb) slot)
                                 "/metabase?user=root&password="))

                     ;; App DB — personal mode uses shared local instances
                     (and (not bot-mode?) (= app-db :postgres))
                     (assoc "MB_DB_TYPE" "postgres"
                            "MB_DB_CONNECTION_URI"
                            (str "jdbc:postgresql://localhost:5432/"
                                 (db-name (root))
                                 "?user=metabase&password=password"))

                     (and (not bot-mode?) (#{:mysql :mariadb} app-db))
                     (assoc "MB_DB_TYPE" "mysql"
                            "MB_DB_CONNECTION_URI"
                            (str "jdbc:mysql://localhost:3306/"
                                 (db-name (root))
                                 "?user=root&password="))

                     ;; Bot-specific env vars
                     bot-mode?
                     (assoc "DISABLE_BUILD_NOTIFICATIONS" "1"
                            "MB_PREMIUM_EMBEDDING_TOKEN"
                            (or (bot-env/resolve-env "MB_PREMIUM_EMBEDDING_TOKEN" (root))
                                (bot-env/resolve-env "MBDEV_ALL_FEATURES_TOKEN" (root))
                                "")
                            "LINEAR_API_KEY"
                            (or (bot-env/resolve-env "LINEAR_API_KEY" (root)) ""))

                     (and bot-mode? bot-name)
                     (assoc "PLAYWRIGHT_DAEMON_SESSION_DIR"
                            (str (root) "/.bot/" bot-name "/playwright/sessions")
                            "PLAYWRIGHT_DAEMON_SOCKETS_DIR"
                            (str (root) "/.bot/" bot-name "/playwright/sockets")))

        headers    [(str "# Auto-generated by ./bin/mage -nvoxland-dev-env")
                    (str "# Worktree: " wt-name " (slot " slot ")")
                    "# Re-run `./bin/mage -nvoxland-dev-env` to update."]
        path       (str (root) "/mise.local.toml")]
    (update-mise-local! (root) env-pairs headers)
    (println (c/green "Wrote " path))))

(defn- update-idea-datasources!
  "Update the 'Project Appdb' data source in .idea/dataSources.xml and .idea/dataSources.local.xml
  to match the current dev-env postgres configuration."
  [app-db]
  (when (= app-db :postgres)
    (let [sources-xml (io/file (root) ".idea/dataSources.xml")
          local-xml   (io/file (root) ".idea/dataSources.local.xml")]
      (when (.exists sources-xml)
        (let [content (slurp sources-xml)
              updated (str/replace content
                                   #"(<data-source[^>]*name=\"Project Appdb\"[^>]*>[\s\S]*?<jdbc-url>)([^<]*)(</jdbc-url>)"
                                   (str "$1jdbc:postgresql://localhost:5432/" (db-name (root)) "$3"))]
          (when (not= content updated)
            (spit sources-xml updated)
            (println (c/green "Updated .idea/dataSources.xml jdbc-url for Project Appdb")))))
      (when (.exists local-xml)
        (let [content (slurp local-xml)
              updated (str/replace content
                                   #"(<data-source[^>]*name=\"Project Appdb\"[\s\S]*?<user-name>)([^<]*)(</user-name>)"
                                   "$1metabase$3")]
          (when (not= content updated)
            (spit local-xml updated)
            (println (c/green "Updated .idea/dataSources.local.xml user-name for Project Appdb"))))))))

(defn- collect-container-names
  "Return the container names that would be created for the given config."
  [{:keys [app-db with bot-name]}]
  (let [bot-mode? (some? bot-name)]
    (cond-> []
      (and (not= app-db :h2)
           (or bot-mode? (not (shared-db-services app-db))))
      (conj (str (container-prefix (root)) (name app-db) "-app"))

      true
      (into (map #(str (container-prefix (root)) (name %) "-wh")
                 (if bot-mode? with (remove shared-db-services with)))))))

(defn- print-summary!
  "Print a summary table of ports, containers, and connection info."
  [slot {:keys [app-db with]}]
  (let [wt-name (worktree-name (root))
        rows    (cond-> [{:service "Jetty backend"  :port (port-for :jetty slot)        :env-var "MB_JETTY_PORT"}
                         {:service "Frontend dev"   :port (port-for :frontend-dev slot)  :env-var "MB_FRONTEND_DEV_PORT"}
                         {:service "nREPL"          :port (port-for :nrepl slot)         :env-var "NREPL_PORT"}
                         {:service "Socket REPL"    :port (port-for :socket-repl slot)   :env-var "SOCKET_REPL_PORT"}]

                  (= app-db :postgres)
                  (conj {:service (str "Postgres (app-db, db: " (db-name (root)) ")") :port 5432 :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mysql)
                  (conj {:service (str "MySQL (app-db, db: " (db-name (root)) ")") :port 3306 :env-var "MB_DB_CONNECTION_URI"})

                  (= app-db :mariadb)
                  (conj {:service (str "MariaDB (app-db, db: " (db-name (root)) ")") :port 3306 :env-var "MB_DB_CONNECTION_URI"})

                  (some #{:postgres} with)
                  (conj {:service (str "Postgres (warehouse, db: " (db-name (root)) "_wh)") :port 5432 :env-var ""})

                  (some #{:mysql} with)
                  (conj {:service (str "MySQL (warehouse, db: " (db-name (root)) "_wh)") :port 3306 :env-var ""})

                  (some #{:mariadb} with)
                  (conj {:service (str "MariaDB (warehouse, db: " (db-name (root)) "_wh)") :port 3306 :env-var ""})

                  (some #{:mongo} with)
                  (conj {:service (str "MongoDB (db: " (db-name (root)) ")") :port 27017 :env-var ""})

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
    (println (c/cyan "Tear down with: ") (c/yellow "./bin/mage -nvoxland-dev-env --down"))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Session layer — background process management

(defn- state-file-path []
  (str (root) "/local/.dev-env-state.edn"))

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
    (assoc "MB_PREMIUM_EMBEDDING_TOKEN" (resolve-token-value token)
           "METASTORE_DEV_SERVER_URL" "https://token-check.staging.metabase.com")

    (= app-db :postgres)
    (assoc "MB_DB_TYPE" "postgres"
           "MB_DB_CONNECTION_URI" (str "jdbc:postgresql://localhost:5432/"
                                       (db-name (root))
                                       "?user=metabase&password=password"))

    (#{:mysql :mariadb} app-db)
    (assoc "MB_DB_TYPE" "mysql"
           "MB_DB_CONNECTION_URI" (str "jdbc:mysql://localhost:3306/"
                                       (db-name (root))
                                       "?user=root&password="))))

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
        log-file   (str "/tmp/mb-" (worktree-name (root)) "-backend.log")
        cmd        ["clojure" (str "-M" aliases) "-p" nrepl-port]
        log        (java.io.File. log-file)
        proc       (apply p/process {:dir       (root)
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
  (let [log-file (str "/tmp/mb-" (worktree-name (root)) "-frontend.log")
        log      (java.io.File. log-file)
        proc     (p/process {:dir       (root)
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
    (println (c/cyan "Stop with: ") (c/yellow "./bin/mage -nvoxland-dev-env --down"))))

(defn- create-bot-dirs!
  "Create all bot directories and .autobot/ with initial status file."
  [_bot-name]
  ;; Create all bot-specific dirs
  (doseq [[_ dirs] bot-dirs]
    (doseq [dir dirs]
      (fs/create-dirs (str (root) "/" dir))))
  ;; Create .bot/autobot/ and initial status file
  (fs/create-dirs (str (root) "/.bot/autobot"))
  (let [status-path (str (root) "/.bot/autobot/llm-status.txt")]
    (when-not (fs/exists? status-path)
      (spit status-path "Starting up")))
  (println (c/green "  Created bot directories")))

(defn- stand-up!
  "Orchestrate: prompt -> validate -> check docker -> start containers -> write toml -> optionally run.
   When --bot is provided, skips interactive prompts and uses Docker containers."
  [opts]
  (let [bot-name    (:bot opts)
        bot-mode?   (some? bot-name)
        reuse?      (and (not bot-mode?) (prompt-reuse-config? opts))
        saved       (when reuse? (:config (read-state-file)))
        edition     (or (:edition saved)
                        (if bot-mode? :ee (select-edition opts)))
        token       (if saved
                      (:token saved)
                      (if bot-mode?
                        :all-features
                        (when (= edition :ee)
                          (let [t (select-token opts)]
                            (validate-token! t)
                            t))))
        app-db      (or (:app-db saved)
                        (some-> (:app-db opts) keyword)
                        (if bot-mode? :postgres (select-app-db opts)))
        with        (or (:with saved)
                        (if bot-mode? [] (select-with opts)))
        slot        (compute-slot (root) (:slot opts))
        config      (validate-services! {:app-db app-db :with with})
        full-config (assoc config :edition edition :token token :bot-name bot-name)]
    ;; In bot mode, always use Docker containers (never shared local DB)
    ;; In personal mode, only Docker for non-shared services
    (let [docker-app-db (when (not= (:app-db config) :h2)
                          (if bot-mode?
                            (:app-db config)
                            (when-not (shared-db-services (:app-db config))
                              (:app-db config))))
          docker-with   (if bot-mode?
                          (:with config)
                          (remove shared-db-services (:with config)))]
      (when (or docker-app-db (seq docker-with))
        (check-docker!))
      (when docker-app-db
        (start-service! (root) docker-app-db "app" slot))
      (doseq [svc docker-with]
        (start-service! (root) svc "wh" slot)))
    ;; Create bot dirs (cheap, always do it)
    (when bot-mode?
      (create-bot-dirs! bot-name))
    ;; Write mise.local.toml (incremental update)
    (generate-mise-local! slot full-config)
    ;; Update IntelliJ data source config (personal mode only)
    (when-not bot-mode?
      (update-idea-datasources! (:app-db config)))
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
  (let [prefix     (container-prefix (root))
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
  (let [toml-path (str (root) "/mise.local.toml")]
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
  (let [prefix     (container-prefix (root))
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
        (println (c/bold (c/green "Containers for " (worktree-name (root)) ":")))
        (println)
        (t/table rows :style :unicode))
      (println (c/yellow "No containers found for " (worktree-name (root)))))))

(defn dev-env!
  "Top-level dispatcher for dev-env command."
  [{:keys [options]}]
  (when (:worktree options)
    (reset! root-override (:worktree options)))
  (let [{:keys [down status]} options]
    (cond
      down   (tear-down!)
      status (print-status!)
      :else  (stand-up! options))))
