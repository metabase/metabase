(ns metabase.test.data.bigquery
  (:require [clojure.string :as s]
            [environ.core :refer [env]]
            [medley.core :as m]
            [metabase.driver.bigquery :as bigquery]
            (metabase.test.data [dataset-definitions :as defs]
                                [datasets :as datasets]
                                [interface :as i])
            [metabase.test.util :refer [resolve-private-fns]]
            [metabase.util :as u])
  (:import java.util.Arrays
           com.google.api.client.util.DateTime
           com.google.api.services.bigquery.Bigquery
           (com.google.api.services.bigquery.model Dataset DatasetReference QueryRequest Table TableDataInsertAllRequest TableDataInsertAllRequest$Rows TableFieldSchema TableReference TableRow TableSchema)
           metabase.driver.bigquery.BigQueryDriver))

(resolve-private-fns metabase.driver.bigquery execute post-process-native)

;;; # ------------------------------------------------------------ CONNECTION DETAILS ------------------------------------------------------------

(def ^:private ^String normalize-name (comp (u/rpartial s/replace #"-" "_") name))

(defn- get-env-var [env-var]
  (or (env (keyword (format "mb-bigquery-%s" (name env-var))))
      (throw (Exception. (format "In order to test BigQuery, you must specify the env var MB_BIGQUERY_%s."
                                 (s/upper-case (s/replace (name env-var) #"-" "_")))))))

;; We'll add a unique prefix like "NR_" to every database we create for this test run so multiple tests running at the same time won't stop over each other
;; This gives us 676 possible prefixes. This should prevent clashes but still recycle prefixes often enough that the code that destroys the test databases
;; (ran at the end of the test suite) will still eventually run and clean up after tests that fail for one reason or another without cleaning up after themselves.
(defonce ^:private ^:const ^String unique-prefix
  (str (apply str (take 2 (shuffle (map char (range (int \A) (inc (int \Z))))))) \_))

(def ^:private ^:const details
  (datasets/when-testing-engine :bigquery
    {:project-id    (get-env-var :project-id)
     :client-id     (get-env-var :client-id)
     :client-secret (get-env-var :client-secret)
     :access-token  (get-env-var :access-token)
     :refresh-token (get-env-var :refresh-token)}))

(def ^:private ^:const ^String project-id (:project-id details))

(def ^:private ^Bigquery bigquery
  (datasets/when-testing-engine :bigquery
    ((resolve 'metabase.driver.bigquery/database->client) {:details details})))

(defn- normalize-name-and-add-prefix [database-name]
  (str unique-prefix (normalize-name database-name)))

(defn- database->connection-details
  ([_ {:keys [database-name]}]
   (database->connection-details database-name))
  ([database-name]
   (assoc details :dataset-id (normalize-name-and-add-prefix database-name))))


;;; # ------------------------------------------------------------ LOADING DATA ------------------------------------------------------------

(defn- create-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (execute (.insert (.datasets bigquery) project-id (doto (Dataset.)
                                                      (.setLocation "US")
                                                      (.setDatasetReference (doto (DatasetReference.)
                                                                              (.setDatasetId dataset-id))))))
  (println (u/format-color 'blue "Created BigQuery dataset '%s'." dataset-id)))

(defn- destroy-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (execute (doto (.delete (.datasets bigquery) project-id dataset-id)
             (.setDeleteContents true)))
  (println (u/format-color 'red "Deleted BigQuery dataset '%s'." dataset-id)))

(def ^:private ^:const valid-field-types
  #{:BOOLEAN :FLOAT :INTEGER :RECORD :STRING :TIMESTAMP})

(defn- create-table! [^String dataset-id, ^String table-id, field-name->type]
  {:pre [(seq dataset-id) (seq table-id) (map? field-name->type) (every? (partial contains? valid-field-types) (vals field-name->type))]}
  (execute (.insert (.tables bigquery) project-id dataset-id (doto (Table.)
                                                               (.setTableReference (doto (TableReference.)
                                                                                     (.setProjectId project-id)
                                                                                     (.setDatasetId dataset-id)
                                                                                     (.setTableId table-id)))
                                                               (.setSchema (doto (TableSchema.)
                                                                             (.setFields (for [[field-name field-type] field-name->type]
                                                                                           (doto (TableFieldSchema.)
                                                                                             (.setMode "REQUIRED")
                                                                                             (.setName (name field-name))
                                                                                             (.setType (name field-type))))))))))
  (println (u/format-color 'blue "Created BigQuery table '%s.%s'." dataset-id table-id)))

(defn- table-row-count ^Integer [^String dataset-id, ^String table-id]
  (first (first (:rows (post-process-native (execute (.query (.jobs bigquery) project-id
                                                             (doto (QueryRequest.)
                                                               (.setQuery (format "SELECT COUNT(*) FROM [%s.%s]" dataset-id table-id))))))))))

;; This is a dirty HACK
(defn- ^DateTime timestamp-korma-form->GoogleDateTime
  "Convert the korma form we normally use to wrap a `Timestamp` to a Google `DateTime`."
  [{[{^String s :korma.sql.utils/generated}] :korma.sql.utils/args}]
  {:pre [(seq s)]}
  (DateTime. (u/->Timestamp (s/replace s #"'" ""))))

(defn- insert-data! [^String dataset-id, ^String table-id, row-maps]
  {:pre [(seq dataset-id) (seq table-id) (sequential? row-maps) (seq row-maps) (every? map? row-maps)]}
  (execute (.insertAll (.tabledata bigquery) project-id dataset-id table-id
                       (doto (TableDataInsertAllRequest.)
                         (.setRows (for [row-map row-maps]
                                     (let [data (TableRow.)]
                                       (doseq [[k v] row-map
                                               :let [v (if (:korma.sql.utils/func v)
                                                         (timestamp-korma-form->GoogleDateTime v)
                                                         v)]]
                                         #_(println "V->" v)
                                         (.set data (name k) v))
                                       (doto (TableDataInsertAllRequest$Rows.)
                                         (.setJson data))))))))
  ;; Wait up to 30 seconds for all the rows to be loaded and become available by BigQuery
  (let [expected-row-count (count row-maps)]
    (loop [seconds-to-wait-for-load 30]
      (let [actual-row-count (table-row-count dataset-id table-id)]
        (cond
          (= expected-row-count actual-row-count) :ok
          (> seconds-to-wait-for-load 0)          (do (Thread/sleep 1000)
                                                      (recur (dec seconds-to-wait-for-load)))
          :else                                   (throw (Exception. (format "Failed to load table data for %s.%s: expected %d rows, loaded %d"
                                                                             dataset-id table-id expected-row-count actual-row-count))))))))

(def ^:private ^:const base-type->bigquery-type
  {:BigIntegerField :INTEGER
   :BooleanField    :BOOLEAN
   :CharField       :STRING
   :DateField       :TIMESTAMP
   :DateTimeField   :TIMESTAMP
   :DecimalField    :FLOAT
   :DictionaryField :RECORD
   :FloatField      :FLOAT
   :IntegerField    :INTEGER
   :TextField       :STRING
   :TimeField       :TIMESTAMP})

(defn- fielddefs->field-name->base-type
  "Convert FIELD-DEFINITIONS to a format appropriate for passing to `create-table!`."
  [field-definitions]
  (into {"id" :INTEGER} (for [{:keys [field-name base-type]} field-definitions]
                          {field-name (or (base-type->bigquery-type base-type)
                                          (println (u/format-color 'red "Don't know what BigQuery type to use for base type: %s" base-type))
                                          (throw (Exception. (format "Don't know what BigQuery type to use for base type: %s" base-type))))})))

(defn- tabledef->prepared-rows
  "Convert TABLE-DEFINITION to a format approprate for passing to `insert-data!`."
  [{:keys [field-definitions rows]}]
  {:pre [(every? map? field-definitions) (sequential? rows) (seq rows)]}
  (let [field-names (map :field-name field-definitions)]
    (for [[i row] (m/indexed rows)]
      (assoc (zipmap field-names (for [v row]
                                   (u/prog1 (if (instance? java.util.Date v)
                                              (DateTime. v)             ; convert to Google version of DateTime, otherwise it doesn't work (!)
                                              v)
                                            (assert (not (nil? <>)))))) ; make sure v is non-nil
             :id (inc i)))))

(defn- load-tabledef! [dataset-name {:keys [table-name field-definitions], :as tabledef}]
  (let [table-name  (normalize-name table-name)]
    (create-table! dataset-name table-name (fielddefs->field-name->base-type field-definitions))
    (insert-data!  dataset-name table-name (tabledef->prepared-rows tabledef))))

;; Keep track of the DBs we create so we can destroy them when tests complete
(def ^:private created-databases
  (atom #{}))

(defn- destroy-test-databases!
  {:expectations-options :after-run}
  []
  (u/pdoseq [db-name @created-databases]
    (u/try-apply destroy-dataset! db-name)))

(defn- create-db! [{:keys [database-name table-definitions]}]
  {:pre [(seq database-name) (sequential? table-definitions)]}
  (let [database-name (normalize-name-and-add-prefix database-name)]
    (swap! created-databases conj database-name)
    (try (destroy-dataset! database-name)
         (catch Throwable _))
    (create-dataset! database-name)
    (doseq [tabledef table-definitions]
      (load-tabledef! database-name tabledef)))
  (println (u/format-color 'green "[OK]")))


;;; # ------------------------------------------------------------ IDatasetLoader ------------------------------------------------------------

(u/strict-extend BigQueryDriver
  i/IDatasetLoader
  (merge i/IDatasetLoaderDefaultsMixin
         {:engine                       (constantly :bigquery)
          :database->connection-details (u/drop-first-arg database->connection-details)
          :create-db!                   (u/drop-first-arg create-db!)
          :destroy-db!                  (constantly nil)}))
