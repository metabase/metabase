(ns metabase.test.data.mongo
  "MongoDB Dataset Loader."
  (:require (monger [collection :as mc]
                    [core :as mg])
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            [metabase.test.data.interface :refer :all])
  (:import (metabase.test.data.interface DatabaseDefinition
                                         FieldDefinition
                                         TableDefinition)))

(defrecord MongoDatasetLoader [])
(extend-protocol IDatasetLoader
  MongoDatasetLoader
  (engine [_]
    :mongo)

  (database->connection-details [_ database-definition]
    {:dbname (escaped-name database-definition)
     :host   "localhost"})

  ;; Nothing to do here ! DB created when we connect to it
  (create-physical-db! [_ _])

  (drop-physical-db! [this database-definition]
    (with-open [mongo-connection (mg/connect (database->connection-details this database-definition))]
      (mg/drop-db mongo-connection (escaped-name database-definition))))

  ;; Nothing to do here, collection is created when we add documents to it
  (create-physical-table! [_ _ _])

  (drop-physical-table! [this database-definition {:keys [table-name]}]
    (with-mongo-connection [^com.mongodb.DBApiLayer mongo-db (database->connection-details this database-definition)]
      (mc/drop mongo-db (name table-name))))

  (load-table-data! [this database-definition {:keys [field-definitions table-name rows]}]
    (with-mongo-connection [^com.mongodb.DBApiLayer mongo-db (database->connection-details this database-definition)]
      (let [field-names (->> field-definitions
                             (map :field-name)
                             (map keyword))]
        ;; Use map-indexed so we can get an ID for each row (index + 1)
        (doseq [[i row] (map-indexed (partial vector) rows)]
          (try
            ;; Insert each row
            (mc/insert mongo-db (name table-name) (assoc (zipmap field-names row)
                                                         :_id (inc i)))
            ;; If row already exists then nothing to do
            (catch com.mongodb.MongoException$DuplicateKey _)))))))

(defn ^MongoDatasetLoader dataset-loader []
  (->MongoDatasetLoader))
