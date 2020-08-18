(ns metabase.test.data.mongo
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [models :refer [Field]]]
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            [metabase.test.data :as data]
            [metabase.test.data.interface :as tx]
            [monger
             [collection :as mc]
             [core :as mg]])
  (:import com.fasterxml.jackson.core.JsonGenerator))

(tx/add-test-extensions! :mongo)

(defmethod tx/dbdef->connection-details :mongo
  [_ _ dbdef]
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
          (try
            ;; Insert each row
            (mc/insert mongo-db (name table-name) (into {:_id (inc i)}
                                                        (zipmap field-names row)))
            ;; If row already exists then nothing to do
            (catch com.mongodb.MongoException _)))))))

(defmethod tx/destroy-db! :mongo
  [driver dbdef]
  (destroy-db! driver dbdef))

(defmethod tx/format-name :mongo
  [_ table-or-field-name]
  (if (= table-or-field-name "id")
    "_id"
    table-or-field-name))

(defn- json-raw
  "Wrap a string so it will be spliced directly into resulting JSON as-is. Analogous to HoneySQL `raw`."
  [^String s]
  (reify json.generate/JSONable
    (to-json [_ generator]
      (.writeRawValue ^JsonGenerator generator s))))

(deftest json-raw-test
  (testing "Make sure the `json-raw` util fn actually works the way we expect it to"
    (is (= "{\"x\":{{param}}}"
           (json/generate-string {:x (json-raw "{{param}}")})))))

(defmethod tx/count-with-template-tag-query :mongo
  [driver table-name field-name param-type]
  (let [{base-type :base_type} (Field (driver/with-driver driver (data/id table-name field-name)))]
    {:projections [:count]
     :query       (json/generate-string
                   [{:$match {(name field-name) (json-raw (format "{{%s}}" (name field-name)))}}
                    {:$group {"_id" nil, "count" {:$sum 1}}}
                    {:$sort {"_id" 1}}
                    {:$project {"_id" false, "count" true}}])
     :collection  (name table-name)}))

(defmethod tx/count-with-field-filter-query :mongo
  [driver table-name field-name]
  (let [{base-type :base_type} (Field (driver/with-driver driver (data/id table-name field-name)))]
    {:projections [:count]
     :query       (json/generate-string
                   [{:$match (json-raw (format "{{%s}}" (name field-name)))}
                    {:$group {"_id" nil, "count" {:$sum 1}}}
                    {:$sort {"_id" 1}}
                    {:$project {"_id" false, "count" true}}])
     :collection  (name table-name)}))
