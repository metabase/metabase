(ns metabase.test.data.druid
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [metabase.driver.druid :as druid]
            (metabase.test.data dataset-definitions
                                [datasets :as datasets]
                                [interface :as i])
            [metabase.test.util :refer [resolve-private-fns]]
            [metabase.util :as u])
  (:import metabase.driver.druid.DruidDriver))

(def ^:private ^:const temp-dir (System/getProperty "java.io.tmpdir"))
(def ^:private ^:const source-filename "checkins.json")

(defn- flattened-test-data []
  (let [dbdef    (i/flatten-dbdef metabase.test.data.dataset-definitions/test-data "checkins")
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

(def ^:private ^:const indexing-task
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
                                  :baseDir temp-dir
                                  :filter  source-filename}}}})

(def ^:private ^:const indexer-endpoint "http://localhost:8090/druid/indexer/v1/task")
(def ^:private ^:const indexer-timeout-seconds
  "Maximum number of seconds we should wait for the indexing task to finish before deciding it's failed."
  120)

(resolve-private-fns metabase.driver.druid GET POST)

(defn- run-indexing-task []
  (let [{:keys [task]} (POST indexer-endpoint, :body indexing-task)
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

(defn- setup-druid-test-data* []
  (println (u/format-color 'blue "Loading druid test data..."))
  (write-dbdef-to-json (flattened-test-data) (str temp-dir "/" source-filename))
  (run-indexing-task))

#_(defn- setup-druid-test-data
  {:expectations-options :before-run}
  []
  (datasets/when-testing-engine :druid
    (setup-druid-test-data*)))

;; TODO - needs to wait until http://localhost:8082/druid/v2/datasources/checkins?interval=-5000/5000 returns data
#_{:dimensions [:venue_name
              :venue_category_name
              :user_password
              :venue_longitude
              :user_name
              :id
              :venue_latitude
              :user_last_login
              :venue_price]
 :metrics [:count]}


(defn- database->connection-details [this context dbdef]
  {:host "http://localhost"
   :port 8082})

(extend DruidDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:engine                       (constantly :druid)
          :database->connection-details database->connection-details
          :create-db!                   (constantly "nil")
          :destroy-db!                  (constantly nil)}))


(defn- destroy-druid-test-data
  {:expectations-options :after-run}
  []
  ;; TODO
  )

;; TODO - spin up a cluster on AWS (?)
;; TODO - don't log druid query during sync
;; TODO - make `:paging` a feature?
