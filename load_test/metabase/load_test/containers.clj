(ns metabase.load-test.containers
  (:require
   [clj-test-containers.core :as tc]
   [clojure.string :as str]
   [integrant.core :as ig]
   [metabase.util.log :as log])
  (:import
   (com.github.dockerjava.api.command CreateNetworkCmd)
   (java.nio.file
    Paths)
   (org.testcontainers DockerClientFactory)
   (org.testcontainers.containers
    Container
    GenericContainer
    Network)
   (org.testcontainers.images.builder
    ImageFromDockerfile)))

(set! *warn-on-reflection* true)

(defn start!
  "Starts the underlying testcontainer instance and adds new values to the
  response map, e.g. :id and :first-mapped-port"
  [{:keys [^GenericContainer container
           log-to
           exposed-ports] :as container-config}]
  (.start container)
  (let [map-port (fn map-port
                   [port]
                   [port (.getMappedPort container port)])
        mapped-ports (into {} (map map-port) exposed-ports)
        container-id ^String (.getContainerId container)
        image-name ^String (.getDockerImageName container)
        logger (tc/log log-to container)]
    (-> container-config
        (merge {:id           container-id
                :mapped-ports mapped-ports
                :image-name   image-name} logger)
        (dissoc :log-to))))

(defn remove-network! [instance]
  (.. (DockerClientFactory/instance)
      client
      (removeNetworkCmd (:id instance))
      exec)
  instance)

(defn remove-container! [instance]
  (.. (DockerClientFactory/instance)
      client
      (removeContainerCmd (:id instance))
      exec)
  instance)

(defn create-network
  "Creates a network. The optional map accepts config values for enabling ipv6
  and setting the driver"
  ([^String name]
   (create-network name {}))
  ([^String name {:keys [ipv6 driver]}]
   (let [builder (doto (Network/builder)
                   (.createNetworkCmdModifier (fn [^CreateNetworkCmd cmd]
                                                (.withName cmd name))))]
     (when ipv6
       (.enableIpv6 builder true))

     (when driver
       (.driver builder driver))

     (let [network (.build builder)
           network-id (.getId network)]
       {:network network
        :id      network-id
        :ipv6    (.getEnableIpv6 network)
        :driver  (.getDriver network)}))))

(defn create-from-docker-file
  "Creates a testcontainer from a provided Dockerfile"
  [{:keys [docker-file build-args] :as options}]
  (->>  (doto  (ImageFromDockerfile.)
          (.withDockerfile (Paths/get "." (into-array [docker-file])))
          (.withBuildArgs build-args))
        (GenericContainer.)
        (assoc options :container)
        tc/init))

(defn- get-db-type
  [{:keys [container-info]}]
  (condp #(str/starts-with? %2 %1) (.getDockerImageName ^Container (:container container-info))
    "postgres" "postgres"))

(defmethod ig/init-key :infra/network [_ {:keys [name]
                                          :or   {name "test.metabase.dev"}}]
  (try
    (assoc (create-network name) :status :success)
    (catch Throwable err
      (log/error err)
      {:status :failed})))

(defmethod ig/init-key :db/postgres [_ {:keys [network version port user password dbname hostname]
                                        :or {version  "14"
                                             port     "5432"
                                             user     "metabase"
                                             password "password"
                                             dbname   "metabase"
                                             hostname "postgres"}}]
  (try
    {:db-config      {:db-type  :postgres
                      :port     port
                      :user     user
                      :password password
                      :dbname   dbname
                      :host     hostname}
     :status         :success
     :container-info (-> (tc/create {:image-name      (str "postgres:" version)
                                     :network         network
                                     :network-aliases [hostname]
                                     :exposed-ports   [(Integer/parseInt port)]
                                     :env-vars        {"POSTGRES_USER"     user
                                                       "POSTGRES_DB"       dbname
                                                       "POSTGRES_PASSWORD" password
                                                       "POSTGRES_PORT"     port}})
                         start!)}
    (catch Throwable err
      (log/error err)
      {:status :failed})))

(defmethod ig/init-key :web/metabase [_ {:keys [app-db port metrics-port token network instance-count virtual-host]}]
  (try
    (when (not= (:status app-db) :success)
      (throw (ex-info "AppDB has not started successfully" {})))
    (let [container-info (into []
                               (map (fn [n]
                                      (->
                                       (tc/create {:image-name    "clojure:tools-deps"
                                                   :command       ["/bin/bash" "-c" "cd /usr/src/app && clojure -M:ee:run"]
                                                   :env-vars      (cond-> {"VIRTUAL_HOST"               virtual-host
                                                                           "MB_PREMIUM_EMBEDDING_TOKEN" token
                                                                           "MB_DB_TYPE"                 (get-db-type app-db)
                                                                           "MB_DB_HOST"                 (-> app-db :db-config :host)
                                                                           "MB_DB_PORT"                 (-> app-db :db-config :port)
                                                                           "MB_DB_DBNAME"               (-> app-db :db-config :dbname)
                                                                           "MB_DB_USER"                 (-> app-db :db-config :user)
                                                                           "MB_DB_PASS"                 (-> app-db :db-config :password)}
                                                                    port         (assoc "MB_PORT" port)
                                                                    metrics-port (assoc "MB_PROMETHEUS_SERVER_PORT" metrics-port))
                                                   :exposed-ports (cond-> [(or port 3000)]
                                                                    metrics-port (conj metrics-port))
                                                   :network       network
                                                   :network-alias [(str "metabase-" n)]
                                                   :wait-for      {:wait-strategy   :http
                                                                   :path            "/api/health"
                                                                   :port            (or port 3000)
                                                                   :method          "GET"
                                                                   :status-codes    [200]
                                                                   :tls             false
                                                                   :read-timout     5
                                                                   :startup-timeout 45}})
                                       (tc/bind-filesystem! {:host-path      "./"
                                                             :container-path "/usr/src/app"
                                                             :mode           :read-write})
                                       start!)))
                               (range instance-count))]
      {:container-info container-info :virtual-host virtual-host :status :success})
    (catch Throwable err
      (log/error err)
      {:status :failed})))

(defmethod ig/init-key :web/nginx [_ {:keys [version network wait-for-host]
                                      :or {version "1.7"
                                           wait-for-host "test.metabase.dev"}}]

  (try
    {:container-info (-> (tc/create {:image-name    (str "nginxproxy/nginx-proxy:" version)
                                     :network       network
                                     :exposed-ports [80]
                                     :wait-for      {:wait-strategy   :http
                                                     :path            "/api/health"
                                                     :headers         {"Host" wait-for-host}
                                                     :port            80
                                                     :method          "GET"
                                                     :status-codes    [200]
                                                     :tls             false
                                                     :read-timout     5
                                                     :startup-timeout 20}})
                         (tc/bind-filesystem! {:host-path      "/var/run/docker.sock"
                                               :container-path "/tmp/docker.sock"
                                               :mode           :read-only})
                         start!)
     :status :success}
    (catch Throwable err
      (log/error err)
      {:status :failed})))

(defmethod ig/halt-key! :infra/container [_ {:keys [container-info]}]
  (try
    (cond
      (map? container-info) (tc/stop! container-info)
      (vector? container-info) (doseq [container container-info]
                                 (#'tc/stop-and-remove-container! container)))
    (catch Throwable err
      (log/error err))))

(defmethod ig/halt-key! :infra/network [_ network]
  (try
    (remove-network! network)
    (catch Throwable err
      (log/error err))))
