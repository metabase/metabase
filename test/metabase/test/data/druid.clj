(ns metabase.test.data.druid
  (:require [clojure.java.io :as io]
            [cheshire.core :as json]
            [environ.core :refer [env]]
            [metabase.driver.druid :as druid]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets]
                                [interface :as i])
            [metabase.test.util :refer [resolve-private-vars]]
            [metabase.util :as u])
  (:import metabase.driver.druid.DruidDriver))

(defn- database->connection-details [& _]
  {:host (or (env :mb-druid-host)
             (throw (Exception. "In order to test Druid, you must specify `MB_DRUID_HOST`.")))
   :port (Integer/parseInt (or (env :mb-druid-port)
                               (throw (Exception. "In order to test Druid, you must specify `MB_DRUID_PORT`."))))})

(u/strict-extend DruidDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:engine                       (constantly :druid)
          :database->connection-details database->connection-details
          :create-db!                   (constantly nil)
          :destroy-db!                  (constantly nil)}))



;;; Setting Up a Server w/ Druid Test Data

;; Unfortunately the process of loading test data onto an external server for CI purposes is a little involved. Before testing against Druid, you'll need to perform the following steps:
;; For EC2 instances, make sure to expose ports `8082` & `8090` for Druid while loading data. Once data has finished loading, you only need to expose port `8082`.
;;
;; 1.  Setup Zookeeper
;;     1A.  Download & extract Zookeeper from `http://zookeeper.apache.org/releases.html#download`
;;     1B.  Create `zookeeper/conf/zoo.cfg` -- see the Getting Started Guide: `http://zookeeper.apache.org/doc/r3.4.6/zookeeperStarted.html`
;;     1C.  `zookeeper/bin/zkServer.sh start`
;;     1D.  `zookeeper/bin/zkServer.sh status` (to make sure it started correctly)
;; 2.  Setup Druid
;;     2A.  Download & extract Druid from `http://druid.io/downloads.html`
;;     2B.  `cp druid/run_druid_server.sh druid/run_historical.sh` and bump the `-Xmx` setting to `6g` or so
;;     2C.  `cd druid && ./run_druid_server.sh coordinator`
;;     2D.  `cd druid && ./run_druid_server.sh broker`
;;     2E.  `cd druid && ./run_historical.sh historical`
;;     2E.  `cd druid && ./run_druid_server.sh overlord`
;; 3.  Generate flattened test data file. Optionally pick a <filename>
;;     3A.  From this namespace in the REPL, run `(generate-json-for-batch-ingestion <filename>)`
;;     3B.  `scp` or otherwise upload this file to the box running druid (if applicable)
;; 4.  Launch Druid Indexing Task
;;     4A.  Run the indexing task on the remote instance.
;;
;;            (run-indexing-task <remote-host> :base-dir <dir-where-you-uploaded-file>, :filename <file>)
;;            e.g.
;;            (run-indexing-task "http://ec2-52-90-109-199.compute-1.amazonaws.com", :base-dir "/home/ec2-user", :filename "checkins.json")
;;
;;          The task will keep you apprised of its progress until it completes (takes 1-2 minutes)
;;     4B.  Keep an eye on `<host>:8082/druid/v2/datasources`. (e.g. "http://ec2-52-90-109-199.compute-1.amazonaws.com:8082/druid/v2/datasources")
;;          This endpoint will return an empty array until the broker knows about the newly ingested segments. When it returns an array with the string `"checkins"` you're ready to
;;          run the tests.
;;     4C.  Kill the `overlord` process once the data has finished loading.
;; 5.  Running Tests
;;     5A.  You can run tests like `ENGINES=druid MB_DRUID_PORT=8082 MB_DRUID_HOST=http://ec2-52-90-109-199.compute-1.amazonaws.com lein test`

(def ^:private ^:const default-filename "Default filename for batched ingestion data file."
  "checkins.json")


;;; Generating Data File

(defn- flattened-test-data []
  (let [dbdef    (i/flatten-dbdef defs/test-data "checkins")
        tabledef (first (:table-definitions dbdef))]
    (->> (:rows tabledef)
         (map (partial zipmap (map :field-name (:field-definitions tabledef))))
         (map-indexed (fn [i row]
                        (assoc row :id (inc i))))
         (sort-by (u/rpartial get "date")))))

(defn- write-dbdef-to-json [db-def filename]
  (io/delete-file filename :silently)
  (let [rows db-def]
    (with-open [writer (io/writer filename)]
      (doseq [row rows]
        (json/generate-stream row writer)
        (.append writer \newline)))))

(defn- generate-json-for-batch-ingestion
  "Generate the file to be used for a batched data ingestion for Druid."
  ([]
   (generate-json-for-batch-ingestion default-filename))
  ([filename]
   (write-dbdef-to-json (flattened-test-data) filename)))


;;; Running Indexing Task

(defn- indexing-task
  "Create a batched ingestion task dictionary."
  [{:keys [base-dir filename]
    :or   {base-dir "/home/ec2-user"
           filename default-filename}}]
  {:type :index
   :spec {:dataSchema {:dataSource      "checkins"
                       :parser          {:type      :string
                                         :parseSpec {:format         :json
                                                     :timestampSpec  {:column :date
                                                                      :format :auto}
                                                     :dimensionsSpec {:dimensions ["id"
                                                                                   "user_last_login"
                                                                                   "user_name"
                                                                                   "user_password"
                                                                                   "venue_category_name"
                                                                                   "venue_latitude"
                                                                                   "venue_longitude"
                                                                                   "venue_name"
                                                                                   "venue_price"]}}}
                       :metricsSpec     [{:type :count
                                          :name :count}]
                       :granularitySpec {:type               :uniform
                                         :segmentGranularity :DAY
                                         :queryGranularity   :NONE
                                         :intervals          ["2000/2016"]}}
          :ioConfig   {:type     :index
                       :firehose {:type    :local
                                  :baseDir base-dir
                                  :filter  filename}}}})

(def ^:private ^:const indexer-timeout-seconds
  "Maximum number of seconds we should wait for the indexing task to finish before deciding it's failed."
  180)

(resolve-private-vars metabase.driver.druid GET POST)

(defn- run-indexing-task
  "Run a batched ingestion task on HOST."
  [host & {:as indexing-task-args}]
  (let [indexer-endpoint (str host ":8090/druid/indexer/v1/task")
        {:keys [task]} (POST indexer-endpoint, :body (indexing-task indexing-task-args))
        status-url     (str indexer-endpoint "/" task "/status")]
    (println "STATUS URL: " (str indexer-endpoint "/" task "/status"))
    (loop [remaining-seconds indexer-timeout-seconds]
      (let [status (get-in (GET status-url) [:status :status])]
        (println (format "%s (%d seconds elapsed)" status (- indexer-timeout-seconds remaining-seconds)))
        (when (not= status "SUCCESS")
          (when (<= remaining-seconds 0)
            (throw (Exception. (str "Failed to finish indexing druid data after " indexer-timeout-seconds " seconds!"))))
          (when-not (= status "RUNNING")
            (throw (Exception. (str "Indexing task failed:\n" (u/pprint-to-str status)))))
          (Thread/sleep 1000)
          (recur (dec remaining-seconds)))))))
