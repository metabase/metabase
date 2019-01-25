(ns metabase.test.data.mongo
  (:require [metabase.driver.mongo.util :refer [with-mongo-connection]]
            [metabase.test.data.interface :as tx]
            [metabase.util :as u]
            [monger
             [collection :as mc]
             [core :as mg]]))

(tx/add-test-extensions! :mongo)

(defmethod tx/dbdef->connection-details :mongo [_ _ dbdef]
  {:dbname (tx/escaped-name dbdef)
   :host   "localhost"})

(defn- destroy-db! [driver dbdef]
  (with-open [mongo-connection (mg/connect (tx/dbdef->connection-details driver :server dbdef))]
    (mg/drop-db mongo-connection (tx/escaped-name dbdef))))

(defmethod tx/create-db! :mongo
  [driver {:keys [table-definitions], :as dbdef} & {:keys [skip-drop-db?], :or {skip-drop-db? false}}]
  (when-not skip-drop-db?
    (destroy-db! driver dbdef))
  (with-mongo-connection [mongo-db (tx/dbdef->connection-details driver :db dbdef)]
    (doseq [{:keys [field-definitions table-name rows]} table-definitions]
      (let [field-names (for [field-definition field-definitions]
                          (keyword (:field-name field-definition)))]
        ;; Use map-indexed so we can get an ID for each row (index + 1)
        (doseq [[i row] (map-indexed (partial vector) rows)]
          (let [row (for [v row]
                      ;; Conver all the java.sql.Timestamps to java.util.Date, because the Mongo driver insists on
                      ;; being obnoxious and going from using Timestamps in 2.x to Dates in 3.x
                      (if (instance? java.sql.Timestamp v)
                        (java.util.Date. (.getTime ^java.sql.Timestamp v))
                        v))]
            (try
              ;; Insert each row
              (mc/insert mongo-db (name table-name) (assoc (zipmap field-names row)
                                                      :_id (inc i)))
              ;; If row already exists then nothing to do
              (catch com.mongodb.MongoException _))))))))


(defmethod tx/format-name :mongo [_ table-or-field-name]
  (if (= table-or-field-name "id")
    "_id"
    table-or-field-name))
