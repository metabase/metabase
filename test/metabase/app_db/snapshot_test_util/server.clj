(ns metabase.app-db.snapshot-test-util.server
  "Starts the server a snapshot is generated from, in a container of a pinned image.

  A dump describes the same schema differently depending on the server that produced it -- Postgres 17 started giving
  NOT NULL constraints names of their own, one MariaDB release writes a bit column as `0x00` where another writes
  `'\\0'` -- so which server a snapshot comes from is part of what the file records. Owning that server here is what
  makes a regeneration on a developer's machine produce the file CI regenerates, rather than a file that depends on
  whichever server `MB_<DB>_TEST_*` happened to point at."
  (:require
   [metabase.util.log :as log])
  (:import
   (org.testcontainers.containers Container$ExecResult GenericContainer)
   (org.testcontainers.utility DockerImageName)))

(set! *warn-on-reflection* true)

(def ^:private flavor->server
  "The server each snapshot file is dumped from, one per file.

  Images are pinned to an exact tag rather than tracking the `latest` the `app-db-snapshot` workflow also tests
  against, so that regenerating a year from now writes the same file it writes today; that workflow's other two tests
  are what cover loading a snapshot into servers newer than the one it came from. The environment matches what that
  workflow starts its own servers with, and `ready` is run over TCP because the temporary server both the MySQL and
  Postgres images run during initialization listens on a unix socket only -- polling that would return ready while
  the real server is still coming up."
  {:postgres                 {:image "postgres:14-alpine"
                              :port  5432
                              :db-type :postgres
                              :env   {"POSTGRES_USER" "mb_test", "POSTGRES_DB" "mb_test"
                                      "POSTGRES_HOST_AUTH_METHOD" "trust"}
                              :user  "mb_test"
                              :db    "mb_test"
                              :ready ["pg_isready" "-h" "127.0.0.1" "-p" "5432" "-U" "mb_test" "-d" "mb_test"]}
   :mysql                    {:image "mysql:8.0"
                              :port  3306
                              :db-type :mysql
                              :env   {"MYSQL_ALLOW_EMPTY_PASSWORD" "true", "MYSQL_DATABASE" "mb_test"}
                              :user  "root"
                              :db    "mb_test"
                              :ready ["mysql" "--protocol=TCP" "-h127.0.0.1" "-P3306" "-uroot" "-e" "SELECT 1"]}
   :mariadb                  {:image "mariadb:12.2"
                              :port  3306
                              :db-type :mysql
                              :env   {"MARIADB_ALLOW_EMPTY_ROOT_PASSWORD" "true", "MARIADB_DATABASE" "mb_test"}
                              :user  "root"
                              :db    "mb_test"
                              :ready ["mariadb" "--protocol=TCP" "-h127.0.0.1" "-P3306" "-uroot" "-e" "SELECT 1"]}
   :mariadb-legacy-timestamp {:image "metabase/mariadb:10.6"
                              :port  3306
                              :db-type :mysql
                              :env   {"MARIADB_ALLOW_EMPTY_ROOT_PASSWORD" "true", "MARIADB_DATABASE" "mb_test"}
                              :user  "root"
                              :db    "mb_test"
                              :ready ["mariadb" "--protocol=TCP" "-h127.0.0.1" "-P3306" "-uroot" "-e" "SELECT 1"]}})

(def flavors
  "Every flavor a snapshot can be generated for, `:h2` -- which needs no server -- included."
  (into [:h2] (sort (keys flavor->server))))

(def ^:private ready-timeout-ms (* 3 60 1000))

(defn- exec
  "Run `args` inside `c`, returning its `ExecResult`."
  ^Container$ExecResult [^GenericContainer c args]
  ;; not the `^String/1` Clojure 1.12 added: Eastwood reads this file with a tools.reader that predates it, and
  ;; fails to read the file at all
  (.execInContainer c ^"[Ljava.lang.String;" (into-array String args)))

(defn- exec!
  "Run `args` inside `c`, returning its stdout. Throws with the command and stderr if it exits non-zero."
  [^GenericContainer c args]
  (let [r (exec c args)]
    (when-not (zero? (.getExitCode r))
      (throw (ex-info "Command failed inside the database container"
                      {:command args, :exit (.getExitCode r), :err (.getStderr r)})))
    (.getStdout r)))

(defn- wait-until-ready!
  "Block until `ready` succeeds inside `c`. A listening port is not enough: both images accept connections while they
  are still initializing."
  [^GenericContainer c ready]
  (let [deadline (+ (System/currentTimeMillis) ready-timeout-ms)]
    (loop []
      (let [r (exec c ready)]
        (cond
          (zero? (.getExitCode r))                   :ready
          (< deadline (System/currentTimeMillis))    (throw (ex-info "Database container never became ready"
                                                                     {:command ready, :err (.getStderr r)}))
          :else                                      (do (Thread/sleep 500) (recur)))))))

(defn do-with-server!
  "Start the pinned server for `flavor`, call `(f server)`, and stop it again.

  `server` is `{:db-type ..., :details ..., :exec! ...}`: the driver to migrate it as, the connection details to
  reach it from this JVM, and a function running a command inside the container, returning its stdout and throwing
  on a non-zero exit. The dump client is run through `exec!` rather than from PATH so that it is always the one
  shipped alongside the server it is reading."
  [flavor f]
  (let [{:keys [image port db-type env user db ready]}
        (or (flavor->server flavor)
            (throw (ex-info "No pinned server for this flavor" {:flavor flavor, :known (keys flavor->server)})))
        c (GenericContainer. (DockerImageName/parse image))]
    (.withExposedPorts c ^"[Ljava.lang.Integer;" (into-array Integer [(int port)]))
    (doseq [[k v] env]
      (.withEnv c ^String k ^String v))
    (try
      (log/infof "Starting %s for the %s snapshot..." image flavor)
      (.start c)
      (wait-until-ready! c ready)
      (f {:db-type db-type
          :details {:host (.getHost c), :port (.getMappedPort c (int port))
                    :user user, :password "", :db db}
          :exec!   (fn [& args] (exec! c args))})
      (finally
        (.stop c)))))
