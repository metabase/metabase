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
          :create-db!                   (constantly nil)}))



;;; Setting Up a Server w/ Druid Test Data

;; Unfortunately the process of loading test data onto an external server for CI purposes is a little involved.
;; A complete step-by-step guide is available on the wiki at `https://github.com/metabase/metabase/wiki/Setting-up-Druid-for-CI-on-EC2`
;; Refer to that page for more information.


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
  300) ; five minutes

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
        (printf "%s (%d seconds elapsed)\n" status (- indexer-timeout-seconds remaining-seconds))
        (when (not= status "SUCCESS")
          (when (<= remaining-seconds 0)
            (throw (Exception. (str "Failed to finish indexing druid data after " indexer-timeout-seconds " seconds!"))))
          (when-not (= status "RUNNING")
            (throw (Exception. (str "Indexing task failed:\n" (u/pprint-to-str status)))))
          (Thread/sleep 1000)
          (recur (dec remaining-seconds)))))))
