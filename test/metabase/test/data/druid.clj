(ns metabase.test.data.druid
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            metabase.driver.druid
            (metabase.test.data dataset-definitions
                                [interface :as i])
            [metabase.util :as u])
  (:import metabase.driver.druid.DruidDriver))

(def ^:private ^:const %dbdef% metabase.test.data.dataset-definitions/test-data)
(def ^:private ^:const %table-name% "checkins")
(def ^:private ^:const %filename% "/Users/camsaul/metabase/checkins.json")

(defn- dbdef->flattened-rows [dbdef table-name]
  (let [dbdef    (i/flatten-dbdef dbdef table-name)
        tabledef (first (:table-definitions dbdef))]
    (->> (:rows tabledef)
         (map (partial zipmap (map :field-name (:field-definitions tabledef))))
         (map-indexed (fn [i row]
                        (assoc row :id (inc i))))
         (sort-by (u/rpartial get "date")))))


(defn- write-flattened-dbdef-to-file [dbdef table-name filename]
  (io/delete-file filename :silently)
  (let [rows (dbdef->flattened-rows dbdef table-name)]
    (with-open [writer (io/writer filename)]
      (doseq [row rows]
        (json/generate-stream row writer)
        (.append writer \newline)))))

(defn- y []
  (write-flattened-dbdef-to-file %dbdef% %table-name% %filename%))

(def ^:private ^:const task
  {:type :index #_:index_realtime
   :spec {:dataSchema {:dataSource      "checkins"
                       :parser          {:parseSpec {:format         :json
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
                                  :baseDir "/Users/camsaul/metabase"
                                  :filter  "checkins.json"}}}})

(defn- x []
  ((resolve 'metabase.driver.druid/POST) "http://localhost:8090/druid/indexer/v1/task"
   :body task))


(defn- database->connection-details [this context dbdef]
  {:host "http://localhost"
   :port "8082"})

(defn- create-db! [this dbdef])

(defn- destroy-db! [this dbdef])

(extend DruidDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:engine                       (constantly :druid)
          :database->connection-details database->connection-details
          :create-db                    create-db!
          :destroy-db!                  destroy-db!}))


;; TODO - spin up a cluster on AWS (?)
;; TODO - don't log druid query during sync
;; TODO - use :granularity for :day / :year (etc) bucketing?
;; TODO - can we filter against a metric?
;; TODO - should we give the timestamp field a special name like *timestamp* (?)
;; TODO - :threshold should take into account :constraints
;; TODO - make `:paging` a feature?
