(ns metabase.test.data.mongo
  (:require [cheshire.core :as json]
            [cheshire.generate :as json.generate]
            [clojure.java.io :as io]
            [clojure.test :refer :all]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.mongo.util :refer [with-mongo-connection]]
            [metabase.test.data.interface :as tx]
            [monger.collection :as mc]
            [monger.core :as mg])
  (:import com.fasterxml.jackson.core.JsonGenerator))

(tx/add-test-extensions! :mongo)

(defn ssl-required?
  "Returns if the mongo server requires an SSL connection."
  []
  (contains? #{"true" "1"} (System/getenv "MB_TEST_MONGO_REQUIRES_SSL")))

(defn- ssl-params
  "Returns the Metabase connection parameters needed for an SSL connection."
  []
  {:ssl true
   :ssl-use-client-auth true
   :client-ssl-key-value (-> "ssl/mongo/metabase.key" io/resource slurp)
   :client-ssl-cert (-> "ssl/mongo/metabase.crt" io/resource slurp)
   :ssl-cert (-> "ssl/mongo/metaca.crt" io/resource slurp)})

(defn conn-details
  "Extends `details` with the parameters necessary for an SSL connection."
  [details]
  (cond->> details
    (ssl-required?) (merge (ssl-params))))

(defmethod tx/dbdef->connection-details :mongo
  [_ _ dbdef]
  (conn-details {:dbname (tx/escaped-database-name dbdef)
                 :user   "metabase"
                 :pass   "metasample123"
                 :host   "localhost"}))

(defn- destroy-db! [driver dbdef]
  (with-mongo-connection [mongo-connection (tx/dbdef->connection-details driver :server dbdef)]
    (mg/drop-db (.getMongo mongo-connection) (tx/escaped-database-name dbdef))))

(defmethod tx/create-db! :mongo
  [driver {:keys [table-definitions], :as dbdef} & {:keys [skip-drop-db?], :or {skip-drop-db? false}}]
  (when-not skip-drop-db?
    (destroy-db! driver dbdef))
  (with-mongo-connection [mongo-db (tx/dbdef->connection-details driver :db dbdef)]
    (doseq [{:keys [field-definitions table-name rows]} table-definitions]
      (let [field-names (for [field-definition field-definitions]
                          (keyword (:field-name field-definition)))]
        ;; Use map-indexed so we can get an ID for each row (index + 1)
        (doseq [[i row] (map-indexed vector rows)]
          (try
            ;; Insert each row
            (mc/insert mongo-db (name table-name) (into {:_id (inc i)}
                                                        (zipmap field-names row)))
            ;; If row already exists then nothing to do
            (catch com.mongodb.MongoException _)))))))

(defmethod tx/destroy-db! :mongo
  [driver dbdef]
  (destroy-db! driver dbdef))

(defmethod ddl.i/format-name :mongo
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
  [_driver table-name field-name _param-type]
  {:projections [:count]
   :query       (json/generate-string
                 [{:$match {(name field-name) (json-raw (format "{{%s}}" (name field-name)))}}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table-name)})

(defmethod tx/count-with-field-filter-query :mongo
  [_driver table-name field-name]
  {:projections [:count]
   :query       (json/generate-string
                 [{:$match (json-raw (format "{{%s}}" (name field-name)))}
                  {:$group {"_id" nil, "count" {:$sum 1}}}
                  {:$sort {"_id" 1}}
                  {:$project {"_id" false, "count" true}}])
   :collection  (name table-name)})
