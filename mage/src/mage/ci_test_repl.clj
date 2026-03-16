(ns mage.ci-test-repl
  "Start a REPL that replicates a CI test job environment.
   Parses .github/workflows/ YAML at runtime to extract services, env vars,
   and Docker images, then starts containers and an nREPL matching CI."
  (:require
   [babashka.process :as process]
   [clj-yaml.core :as yaml]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private workflows-dir
  (str u/project-root-directory "/.github/workflows"))

(def ^:private container-prefix "mb-ci")

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
   Returns a seq of maps with :workflow, :job, :version-name, :matrix-version, :job-map."
  [workflow-name parsed]
  (when-let [jobs (:jobs parsed)]
    (for [[job-key job-map] jobs
          :when (uses-test-driver? job-map)
          :let [matrix (get-in job-map [:strategy :matrix])
                versions (or (:version matrix) [{}])]
          version versions]
      {:workflow     workflow-name
       :job          (name job-key)
       :version-name (or (:name version) nil)
       :matrix-version version
       :job-map      job-map})))

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
  "Format a test job entry for display in fzf."
  [{:keys [workflow job version-name]}]
  (if version-name
    (str workflow "/" job " (" version-name ")")
    (str workflow "/" job)))

(defn- has-services?
  "Return true if the job has Docker services that can be started locally."
  [{:keys [job-map]}]
  (seq (:services job-map)))

;;; ------------------------------------------------ Docker helpers ------------------------------------------------

(defn- health-check-cmd
  "Infer a health check command for a Docker service based on its image and env vars."
  [image port-mapping svc-env]
  (let [container-port (second (str/split port-mapping #":"))]
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
      (str "wget -qO- http://127.0.0.1:" container-port "/status/health || exit 1")

      (str/includes? image "presto")
      (str "curl -sk https://127.0.0.1:" container-port "/v1/info | grep -q '\"starting\":false' || exit 1")

      (str/includes? image "mssql")
      "/opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U SA -P 'P@ssw0rd' -C -Q 'SELECT 1' || exit 1"

      :else "true")))

(defn- kill-existing!
  "Stop and remove a Docker container if it exists."
  [container-name]
  (shell/sh* {:quiet? true} "docker" "kill" container-name)
  (shell/sh* {:quiet? true} "docker" "rm" container-name))

(defn- start-container!
  "Start a Docker container for a CI service."
  [svc-name image port-mapping env-map]
  (let [container-name (str container-prefix "-" (name svc-name))
        ;; Check if container is already running with the right image
        existing       (-> (shell/sh* {:quiet? true} "docker" "ps" "--format" "{{.Names}}" "--filter" (str "name=^" container-name "$"))
                           :out first)
        reuse?         (when existing
                         (let [current-image (-> (shell/sh* {:quiet? true} "docker" "inspect" "--format" "{{.Config.Image}}" container-name)
                                                 :out first)]
                           (= current-image image)))]
    (if reuse?
      (println (c/green "Reusing existing") container-name (str "(" image ")"))
      (do
        (kill-existing! container-name)
        (let [env-args (mapcat (fn [[k v]] ["-e" (str (name k) "=" v)]) (or env-map {}))
              health   (health-check-cmd image port-mapping env-map)
              cmd      (concat ["docker" "run" "-d"
                                "--name" container-name
                                "-p" port-mapping]
                               env-args
                               [image])]
          (println (c/green "Starting") image "as" container-name (str "(" port-mapping ")"))
          (u/debug "Running:" (str/join " " cmd))
          (apply shell/sh cmd)
          ;; Wait for health
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
                  (recur (inc i)))))))))))

;;; ------------------------------------------------- Main logic -------------------------------------------------

(defn- start-services!
  "Start Docker containers for all services in a job, resolving matrix expressions."
  [{:keys [job-map matrix-version]}]
  (doseq [[svc-name svc-def] (:services job-map)]
    (let [resolved    (resolve-service-map svc-def matrix-version)
          image       (:image resolved)
          ports       (first (:ports resolved))
          svc-env     (:env resolved)]
      (when (and image (not (str/includes? image "${")))
        (start-container! svc-name image ports svc-env)))))

(defn- export-env-summary
  "Collect and print the env vars that would be exported, returning them as a map."
  [{:keys [job-map matrix-version]}]
  (let [env-map (resolve-env-map (:env job-map) matrix-version)]
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

(defn ci-test-repl
  "Start a REPL replicating the CI environment for a given workflow/job.
   If no arguments are provided, present an interactive fuzzy finder."
  [{:keys [workflow job]}]
  (let [test-job (if (and workflow job)
                   (find-test-job workflow job)
                   (select-test-job!))]
    (println)
    (println (c/bold (str "=== CI Test REPL: " (display-name test-job) " ===")))
    (println)

    ;; Start Docker services
    (when (has-services? test-job)
      (start-services! test-job))

    ;; Collect env vars
    (let [ci-env (export-env-summary test-job)]
      (println)
      (println (c/bold "Starting nREPL") "(aliases: :dev:ee:ee-dev:drivers:drivers-dev)...")
      (println "To stop containers:" (c/green (str "docker rm -f $(docker ps -q --filter name=" container-prefix ")")))
      (println)

      ;; Replace this process with the nREPL (like shell `exec`)
      (let [extra-env (into {} (map (fn [[k v]] [(name k) (str v)]) ci-env))]
        (process/exec {:extra-env extra-env}
                      "clojure" "-M:dev:ee:ee-dev:drivers:drivers-dev"
                      "-m" "nrepl.cmdline" "--interactive")))))
