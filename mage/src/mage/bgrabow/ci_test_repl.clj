(ns mage.bgrabow.ci-test-repl
  "Start a REPL that replicates a CI test job environment.
   Parses .github/workflows/ YAML at runtime to extract services, env vars,
   and Docker images, then starts containers and an nREPL matching CI."
  (:require
   [babashka.process :as process]
   [clj-yaml.core :as yaml]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private workflows-dir
  (str u/project-root-directory "/.github/workflows"))

(def ^:private container-prefix "mb-ci")

;;; -------------------------------------------------- Port map --------------------------------------------------

(def ^:private port-map
  "Docker image → host port. Loaded from ci_port_map.edn at require time."
  (edn/read-string (slurp (io/resource "mage/ci_port_map.edn"))))

(defn- host-port-for-image
  "Look up the host port for a Docker image from the port map.
   Falls back to the container port from the CI YAML if not mapped."
  [image ci-port-mapping]
  (let [container-port (second (str/split ci-port-mapping #":"))]
    (if-let [mapped (get port-map image)]
      (str mapped)
      container-port)))

;;; ------------------------------------------------- YAML parsing -------------------------------------------------

(defn- parse-workflow-file
  "Parse a YAML workflow file, returning nil if parsing fails."
  [^java.io.File f]
  (try
    (yaml/parse-string (slurp f))
    (catch Exception _e
      nil)))

(defn- workflow-name
  "Derive a short workflow name from a filename like 'app-db.yml'."
  [^java.io.File f]
  (str/replace (.getName f) #"\.ya?ml$" ""))

(defn- uses-test-driver?
  "Return true if the job map has a step that uses ./.github/actions/test-driver."
  [job-map]
  (some #(= "./.github/actions/test-driver" (:uses %))
        (:steps job-map)))

(defn- resolve-matrix-expr
  "Resolve a GitHub Actions expression like '${{ matrix.version.image }}' or
   '${{ matrix.version.env.enable-ssl-tests }}' using the given matrix-version map.
   Returns the original string if not resolvable."
  [s matrix-version]
  (if (and (string? s) (str/includes? s "${{"))
    (str/replace s #"\$\{\{\s*matrix\.version\.([\w.-]+)\s*\}\}"
                 (fn [[whole field-path]]
                   (let [ks (mapv keyword (str/split field-path #"\."))]
                     (str (get-in matrix-version ks whole)))))
    s))

(defn- resolve-service-map
  "Resolve matrix expressions in a service definition."
  [svc-map matrix-version]
  (-> svc-map
      (update :image resolve-matrix-expr matrix-version)
      (update :env (fn [env]
                     (when env
                       (into {} (map (fn [[k v]]
                                       [k (resolve-matrix-expr (str v) matrix-version)])
                                     env)))))))

(defn- resolve-env-map
  "Resolve matrix expressions and filter out secrets/GitHub expressions from an env map."
  [env-map matrix-version]
  (when env-map
    (->> env-map
         (map (fn [[k v]]
                (let [resolved (resolve-matrix-expr (str v) matrix-version)]
                  [k resolved])))
         (remove (fn [[k v]]
                   (or ;; Filter out any unresolved expressions (secrets, vars, github context)
                    (str/includes? (str v) "${{")
                    ;; Skip internal CI-only vars
                    (str/starts-with? (name k) "__"))))
         (into {}))))

;;; ----------------------------------------------- Test job discovery -----------------------------------------------

(defn- extract-test-jobs-with-matrix
  "Extract test jobs with their matrix version variants.
   Returns a seq of maps with :workflow, :job, :junit-name, :version-name,
   :matrix-version, :job-map."
  [workflow-name parsed]
  (when-let [jobs (:jobs parsed)]
    (for [[job-key job-map] jobs
          :when (uses-test-driver? job-map)
          :let [matrix (get-in job-map [:strategy :matrix])
                versions (or (:version matrix) [{}])]
          version versions]
      {:workflow       workflow-name
       :job            (name job-key)
       :junit-name     (:junit-name version)
       :version-name   (:name version)
       :matrix-version version
       :job-map        job-map})))

(defn- all-test-jobs
  "Parse all workflow files and return test jobs with matrix expansion."
  []
  (let [dir   (io/file workflows-dir)
        files (->> (.listFiles dir)
                   (filter #(re-matches #".*\.ya?ml$" (.getName ^java.io.File %)))
                   (sort-by #(.getName ^java.io.File %)))]
    (mapcat (fn [^java.io.File f]
              (when-let [parsed (parse-workflow-file f)]
                (extract-test-jobs-with-matrix (workflow-name f) parsed)))
            files)))

(defn- display-name
  "Format a test job entry for display in fzf.
   Format: workflow/job/junit-name, or workflow/job (version-name) as fallback."
  [{:keys [workflow job junit-name version-name]}]
  (cond
    junit-name   (str workflow "/" job "/" junit-name)
    version-name (str workflow "/" job " (" version-name ")")
    :else        (str workflow "/" job)))

(defn- has-services?
  "Return true if the job has Docker services that can be started locally."
  [{:keys [job-map]}]
  (seq (:services job-map)))

;;; --------------------------------------------- Container naming ------------------------------------------------

(defn- image->container-suffix
  "Derive a container name suffix from a Docker image string.
   e.g. 'circleci/mariadb:10.6' → 'mariadb-10-6'
        'cimg/mysql:8.4'        → 'mysql-8-4'
        'pgvector/pgvector:pg17' → 'pgvector-pg17'"
  [image]
  (-> image
      ;; Take the part after the last /
      (str/replace #"^.*/" "")
      ;; Replace : and . with -
      (str/replace #"[:.]+$" "")
      (str/replace #":" "-")
      (str/replace #"\." "-")))

;;; ------------------------------------------------ Docker helpers ------------------------------------------------

(defn- health-check-cmd
  "Infer a health check command for a Docker service based on its image and env vars."
  [image svc-env]
  (cond
    (or (str/includes? image "mysql") (str/includes? image "mariadb"))
    "mysqladmin ping -h 127.0.0.1 --silent"

    (or (str/includes? image "postgres") (str/includes? image "pgvector"))
    "pg_isready -h 127.0.0.1"

    (str/includes? image "mongo")
    (let [user (get svc-env :MONGO_INITDB_ROOT_USERNAME)
          pass (get svc-env :MONGO_INITDB_ROOT_PASSWORD)]
      (if (and user pass)
        (str "mongosh --quiet --eval 'db.runCommand({ping:1})'"
             " -u " user " -p " pass " --authenticationDatabase admin || exit 1")
        "mongosh --quiet --eval 'db.runCommand({ping:1})' || exit 1"))

    (str/includes? image "druid")
    "wget -qO- http://127.0.0.1:8082/status/health || exit 1"

    (str/includes? image "presto")
    "curl -sk https://127.0.0.1:8443/v1/info | grep -q '\"starting\":false' || exit 1"

    (str/includes? image "mssql")
    "/opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U SA -P 'P@ssw0rd' -C -Q 'SELECT 1' || exit 1"

    :else "true"))

(defn- kill-existing!
  "Stop and remove a Docker container if it exists."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- running-container-image
  "Return the Docker image of a running container with the exact name, or nil."
  [container-name]
  (let [lines (:out (shell/sh* {:quiet? true} "docker" "ps" "--format" "{{.Names}}\t{{.Image}}"))]
    (some (fn [line]
            (let [[cname cimage] (str/split line #"\t")]
              (when (= cname container-name) cimage)))
          lines)))

(defn- wait-for-container-running!
  "Wait until a Docker container is in the Running state (process has started)."
  [container-name]
  (loop [i 0]
    (let [result (shell/sh* {:quiet? true}
                            "docker" "inspect" "--format" "{{.State.Running}}" container-name)
          running? (= "true" (first (:out result)))]
      (cond
        running? true

        (>= i 30)
        (do (println (c/red "\nContainer" container-name "never reached Running state."))
            (println "Check: docker logs" container-name)
            (u/exit 1))

        :else
        (do (Thread/sleep 500)
            (recur (inc i)))))))

(defn- start-container!
  "Start a Docker container for a CI service."
  [image ci-port-mapping svc-env]
  (let [suffix         (image->container-suffix image)
        container-name (str container-prefix "-" suffix)
        host-port      (host-port-for-image image ci-port-mapping)
        container-port (second (str/split ci-port-mapping #":"))
        port-mapping   (str host-port ":" container-port)
        current-image  (running-container-image container-name)]
    (if (= current-image image)
      (do (println (c/green "Reusing existing") container-name (str "(" image ")"))
          {:container-name container-name :host-port host-port})
      (do
        (kill-existing! container-name)
        (let [env-args (mapcat (fn [[k v]] ["-e" (str (name k) "=" v)]) (or svc-env {}))
              cmd      (concat ["docker" "run" "-d"
                                "--name" container-name
                                "-p" port-mapping]
                               env-args
                               [image])]
          (println (c/green "Starting") image "as" container-name (str "(" port-mapping ")"))
          (u/debug "Running:" (str/join " " cmd))
          (let [result (apply shell/sh* cmd)]
            (when-not (zero? (:exit result))
              (println (c/red "Failed to start container:") (str/join "\n" (:err result)))
              (u/exit 1)))
          ;; Wait for the container process to actually be running before health-checking
          (wait-for-container-running! container-name)
          ;; Now wait for the service inside to accept connections
          (let [health (health-check-cmd image svc-env)]
            (print "Waiting for" container-name "to be ready")
            (flush)
            (loop [i 0]
              (let [result (shell/sh* {:quiet? true} "docker" "exec" container-name "sh" "-c" health)]
                (cond
                  (zero? (:exit result))
                  (println (c/green " ready."))

                  (>= i 90)
                  (do
                    (println (c/red " timed out after 90s!"))
                    (println "Check: docker logs" container-name)
                    (u/exit 1))

                  :else
                  (do
                    (print ".")
                    (flush)
                    (Thread/sleep 1000)
                    (recur (inc i))))))))
        {:container-name container-name :host-port host-port}))))

;;; ------------------------------------------------- Main logic -------------------------------------------------

(defn- start-services!
  "Start Docker containers for all services in a job, resolving matrix expressions.
   Returns a map of {ci-host-port → local-host-port} for port remapping in env vars."
  [{:keys [job-map matrix-version]}]
  (into {}
        (for [[_svc-name svc-def] (:services job-map)
              :let [resolved (resolve-service-map svc-def matrix-version)
                    image    (:image resolved)
                    ci-ports (first (:ports resolved))
                    svc-env  (:env resolved)]
              :when (and image (not (str/includes? image "${")))
              :let [ci-host-port (first (str/split ci-ports #":"))
                    {:keys [host-port]} (start-container! image ci-ports svc-env)]
              :when (not= ci-host-port host-port)]
          [ci-host-port host-port])))

(defn- remap-env-ports
  "Replace CI host ports with local host ports in env var values."
  [env-map port-remaps]
  (if (empty? port-remaps)
    env-map
    (reduce-kv (fn [m k v]
                 (let [remapped (reduce-kv (fn [s ci-port local-port]
                                             (if (= s ci-port) local-port s))
                                           (str v) port-remaps)]
                   (assoc m k remapped)))
               {} env-map)))

(defn- export-env-summary
  "Collect and print the env vars that would be exported, returning them as a map."
  [{:keys [job-map matrix-version]} port-remaps]
  (let [env-map (-> (resolve-env-map (:env job-map) matrix-version)
                    (remap-env-ports port-remaps))]
    (when (seq env-map)
      (println)
      (println (c/bold "Exported env vars:"))
      (doseq [[k v] (sort-by key env-map)]
        (println (str "  " (name k) "=" v))))
    env-map))

(defn- select-test-job!
  "Interactive fuzzy finder to select a test job."
  []
  (let [jobs       (all-test-jobs)
        local-jobs (filter has-services? jobs)
        labels     (mapv display-name local-jobs)
        selected   (u/fzf-select!
                    labels
                    (str/join " " ["--header" "'Select a CI test job (only jobs with Docker services shown)'"
                                   "--header-first"
                                   "--header-border" "rounded"]))]
    (when (str/blank? selected)
      (println (c/red "No job selected."))
      (u/exit 1))
    (let [idx (.indexOf ^java.util.List labels (str/trim selected))]
      (nth local-jobs idx))))

(defn- find-test-job
  "Find a test job by workflow/job name. For matrix jobs, if multiple versions exist,
   use fzf to select; for single-version matrix jobs, use the only version."
  [workflow job]
  (let [jobs    (all-test-jobs)
        matches (filter #(and (= workflow (:workflow %))
                              (= job (:job %)))
                        jobs)]
    (case (count matches)
      0 (do (println (c/red (str "Unknown job: " workflow "/" job)))
            (println "Run" (c/green "./bin/mage ci-test-jobs") "to see available jobs.")
            (u/exit 1))
      1 (first matches)
      ;; Multiple matrix versions — let user pick
      (let [labels   (mapv display-name matches)
            selected (u/fzf-select!
                      labels
                      (str/join " " ["--header" (str "'Select a version for " workflow "/" job "'")
                                     "--header-first"
                                     "--header-border" "rounded"]))]
        (when (str/blank? selected)
          (println (c/red "No version selected."))
          (u/exit 1))
        (let [idx (.indexOf ^java.util.List labels (str/trim selected))]
          (nth matches idx))))))

(defn- shell-quote
  "Quote a string for shell if it contains special characters."
  [s]
  (if (re-find #"[^a-zA-Z0-9_./:=@,-]" s)
    (str "'" (str/replace s "'" "'\\''") "'")
    s))

(defn- docker-cmds-for-services
  "Build docker run command vectors for all services in a job without executing them.
   Returns a seq of command vectors."
  [{:keys [job-map matrix-version]}]
  (for [[_svc-name svc-def] (:services job-map)
        :let [resolved (resolve-service-map svc-def matrix-version)
              image    (:image resolved)
              ci-ports (first (:ports resolved))
              svc-env  (:env resolved)]
        :when (and image (not (str/includes? image "${")))
        :let [suffix         (image->container-suffix image)
              container-name (str container-prefix "-" suffix)
              host-port      (host-port-for-image image ci-ports)
              container-port (second (str/split ci-ports #":"))
              port-mapping   (str host-port ":" container-port)
              env-args       (mapcat (fn [[k v]] ["-e" (str (name k) "=" v)]) (or svc-env {}))]]
    (vec (concat ["docker" "run" "-d"
                  "--name" container-name
                  "-p" port-mapping]
                 env-args
                 [image]))))

(def ^:private clojure-cmd
  ["clojure" "-M:dev:ee:ee-dev:drivers:drivers-dev" "-m" "nrepl.cmdline" "--interactive"])

(defn- compute-port-remaps
  "Compute the port remappings that would result from starting services.
   Returns a map of {ci-host-port → local-host-port}."
  [{:keys [job-map matrix-version]}]
  (into {}
        (for [[_svc-name svc-def] (:services job-map)
              :let [resolved (resolve-service-map svc-def matrix-version)
                    image    (:image resolved)
                    ci-ports (first (:ports resolved))]
              :when (and image (not (str/includes? image "${")))
              :let [ci-host-port (first (str/split ci-ports #":"))
                    host-port    (host-port-for-image image ci-ports)]
              :when (not= ci-host-port host-port)]
          [ci-host-port host-port])))

(defn- dry-run!
  "Print the docker commands, env vars, and clojure command without executing anything."
  [test-job]
  (let [docker-cmds (when (has-services? test-job)
                      (docker-cmds-for-services test-job))
        port-remaps (if (has-services? test-job)
                      (compute-port-remaps test-job)
                      {})
        ci-env      (-> (resolve-env-map (get-in test-job [:job-map :env]) (:matrix-version test-job))
                        (remap-env-ports port-remaps))]
    (when (seq docker-cmds)
      (println "# Docker commands")
      (doseq [cmd docker-cmds]
        (println (str/join " " (map shell-quote cmd))))
      (println))
    (when (seq ci-env)
      (println "# Environment variables")
      (doseq [[k v] (sort-by key ci-env)]
        (println (str "export " (name k) "=" (shell-quote (str v)))))
      (println))
    (println "# Clojure REPL command")
    (println (str/join " " clojure-cmd))))

(defn ci-test-repl
  "Start a REPL replicating the CI environment for a given workflow/job.
   If no arguments are provided, present an interactive fuzzy finder.
   Pass :dry-run? true to print commands without executing."
  [{:keys [workflow job dry-run?]}]
  (let [test-job (if (and workflow job)
                   (find-test-job workflow job)
                   (select-test-job!))]
    (if dry-run?
      (dry-run! test-job)
      (do
        (println)
        (println (c/bold (str "=== CI Test REPL: " (display-name test-job) " ===")))
        (println)

        ;; Start Docker services and collect port remappings
        (let [port-remaps (if (has-services? test-job)
                            (start-services! test-job)
                            {})
              ci-env      (export-env-summary test-job port-remaps)]
          (println)
          (println (c/bold "Starting nREPL") "(aliases: :dev:ee:ee-dev:drivers:drivers-dev)...")
          (println "To stop containers:" (c/green (str "docker rm -f $(docker ps -q --filter name=" container-prefix ")")))
          (println)

          ;; Replace this process with the nREPL (like shell `exec`)
          (let [extra-env (into {} (map (fn [[k v]] [(name k) (str v)]) ci-env))]
            (process/exec {:extra-env extra-env}
                          "clojure" "-M:dev:ee:ee-dev:drivers:drivers-dev"
                          "-m" "nrepl.cmdline" "--interactive")))))))
