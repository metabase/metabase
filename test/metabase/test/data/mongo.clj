(ns metabase.test.data.mongo
  (:require (monger [collection :as mc]
                    [core :as mg])
            metabase.driver.mongo
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            [metabase.test.data.interface :as i])
  (:import metabase.driver.mongo.MongoDriver))

(defn- database->connection-details
  ([dbdef]
   {:dbname (i/escaped-name dbdef)
    :host   "localhost"})
  ([_ _ dbdef]
   (database->connection-details dbdef)))

(defn- destroy-db! [_ dbdef]
  (with-open [mongo-connection (mg/connect (database->connection-details dbdef))]
    (mg/drop-db mongo-connection (i/escaped-name dbdef))))

(defn- create-db! [this {:keys [table-definitions], :as dbdef}]
  (destroy-db! this dbdef)
  (with-mongo-connection [^com.mongodb.DB mongo-db (database->connection-details dbdef)]
    (doseq [{:keys [field-definitions table-name rows]} table-definitions]
      (let [field-names (->> field-definitions
                             (map :field-name)
                             (map keyword))]
        ;; Use map-indexed so we can get an ID for each row (index + 1)
        (doseq [[i row] (map-indexed (partial vector) rows)]
          (let [row (for [v row]
                      ;; Conver all the java.sql.Timestamps to java.util.Date, because the Mongo driver insists on being obnoxious and going from
                      ;; using Timestamps in 2.x to Dates in 3.x
                      (if (= (type v) java.sql.Timestamp)
                        (java.util.Date. (.getTime ^java.sql.Timestamp v))
                        v))]
            (try
              ;; Insert each row
              (mc/insert mongo-db (name table-name) (assoc (zipmap field-names row)
                                                           :_id (inc i)))
              ;; If row already exists then nothing to do
              (catch com.mongodb.MongoException _))))))))


(extend MongoDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:create-db!                   create-db!
          :destroy-db!                  destroy-db!
          :database->connection-details database->connection-details
          :engine                       (constantly :mongo)
          :expected-base-type->actual   (fn [_ base-type]
                                          (let [expected->actual {:DateTimeField :DateField}]
                                            (or (expected->actual base-type)
                                                base-type)))
          :format-name                  (fn [_ table-or-field-name]
                                          (if (= table-or-field-name "id") "_id"
                                              table-or-field-name))}))
