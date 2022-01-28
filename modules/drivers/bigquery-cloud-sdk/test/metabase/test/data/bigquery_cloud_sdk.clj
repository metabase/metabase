(ns metabase.test.data.bigquery-cloud-sdk
  (:require [clojure.string :as str]
            [flatland.ordered.map :as ordered-map]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.bigquery-cloud-sdk :as bigquery]
            [metabase.test.data :as data]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import [com.google.cloud.bigquery BigQuery BigQuery$DatasetDeleteOption BigQuery$DatasetListOption
                                      BigQuery$DatasetOption BigQuery$TableListOption BigQuery$TableOption Dataset
                                      DatasetId DatasetInfo Field  InsertAllRequest InsertAllRequest$RowToInsert
                                      InsertAllResponse LegacySQLTypeName Schema StandardTableDefinition TableId
                                      TableInfo TableResult]))

(sql.tx/add-test-extensions! :bigquery-cloud-sdk)

(def ^:private ns-load-time (System/currentTimeMillis))

;; Don't enable foreign keys when testing because BigQuery *doesn't* have a notion of foreign keys. Joins are still
;; allowed, which puts us in a weird position, however; people can manually specifiy "foreign key" relationships in
;; admin and everything should work correctly. Since we can't infer any "FK" relationships during sync our normal FK
;; tests are not appropriate for BigQuery, so they're disabled for the time being.
;;
;; TODO - either write BigQuery-speciifc tests for FK functionality or add additional code to manually set up these FK
;; relationships for FK tables
(defmethod driver/supports? [:bigquery-cloud-sdk :foreign-keys] [_ _] (not config/is-test?))


;;; ----------------------------------------------- Connection Details -----------------------------------------------

(defn- transient-dataset?
  "Returns a boolean indicating whether the given `dataset-name` (as per its definition, NOT the physical schema name
  that is to be created on the cluster) should be made transient (i.e. created and destroyed with every test run, for
  instance to check time intervals relative to \"now\")."
  [dataset-name]
  (str/includes? dataset-name "checkins_interval_"))

(defn- normalize-name ^String [db-or-table identifier]
  (let [s (str/replace (name identifier) "-" "_")]
    (case db-or-table
      :db    (cond-> (str "v3_" s)
               ;; for transient datasets (i.e. those that are created and torn down with each test run), we should add
               ;; some unique name portion to prevent independent parallel test runs from interfering with each other
               (transient-dataset? s)
               ;; for transient datasets, we will make them unique by appending a suffix that represents the millisecond
               ;; timestamp from when this namespace was loaded (i.e. test initialized on this particular JVM/instance)
               ;; note that this particular dataset will not be deleted after this test run finishes, since there is no
               ;; reasonable hook to do so (from this test extension namespace), so instead we will rely on each run
               ;; cleaning up outdated, transient datasets via the `transient-dataset-outdated?` mechanism above
               (str "__transient_" ns-load-time))
      :table s)))

(defn- test-db-details []
  (reduce
     (fn [acc env-var]
       (assoc acc env-var (tx/db-test-env-var :bigquery-cloud-sdk env-var)))
     {}
     [:project-id :service-account-json]))

(defn- bigquery
  "Get an instance of a `Bigquery` client."
  ^BigQuery []
  (#'bigquery/database->client {:details (test-db-details)}))

(defn project-id
  "BigQuery project ID that we're using for tests, either from the env var `MB_BIGQUERY_TEST_PROJECT_ID`, or if that is
  not set, from the BigQuery client instance itself (which ultimately comes from the value embedded in the service
  account JSON)."
  ^String []
  (let [details (test-db-details)
        bq      (bigquery)]
    (or (:project-id details) (.. bq getOptions getProjectId))))

(defmethod tx/dbdef->connection-details :bigquery-cloud-sdk
  [_driver _context {:keys [database-name]}]
  (assoc (test-db-details) :dataset-id (normalize-name :db database-name) :include-user-id-and-hash true))


;;; -------------------------------------------------- Loading Data --------------------------------------------------

(defmethod tx/format-name :bigquery-cloud-sdk [_ table-or-field-name]
  (u/snake-key table-or-field-name))

(defn- create-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (.create (bigquery) (DatasetInfo/of (DatasetId/of (project-id) dataset-id)) (u/varargs BigQuery$DatasetOption))
  (println (u/format-color 'blue "Created BigQuery dataset `%s.%s`." (project-id) dataset-id)))

(defn- destroy-dataset! [^String dataset-id]
  {:pre [(seq dataset-id)]}
  (.delete (bigquery) dataset-id (u/varargs
                                   BigQuery$DatasetDeleteOption
                                   [(BigQuery$DatasetDeleteOption/deleteContents)]))
  (println (u/format-color 'red "Deleted BigQuery dataset `%s.%s`." (project-id) dataset-id)))

(defn execute!
  "Execute arbitrary (presumably DDL) SQL statements against the test project. Waits for statement to complete, throwing
  an Exception if it fails."
  ^TableResult [format-string & args]
  (driver/with-driver :bigquery-cloud-sdk
    (let [sql (apply format format-string args)]
      (printf "[BigQuery] %s\n" sql)
      (flush)
      (#'bigquery/execute-bigquery-on-db (data/db) sql nil nil nil))))

(def ^:private valid-field-types
  #{:BOOLEAN :DATE :DATETIME :FLOAT :INTEGER :NUMERIC :RECORD :STRING :TIME :TIMESTAMP})

;; Fields must contain only letters, numbers, and underscores, start with a letter or underscore, and be at most 128
;; characters long.
(def ^:private ValidFieldName #"^[A-Za-z_]\w{0,127}$")

(s/defn ^:private delete-table!
  [dataset-id :- su/NonBlankString, table-id :- su/NonBlankString]
  (.delete (bigquery) (TableId/of dataset-id table-id))
  (println (u/format-color 'red "Deleted table `%s.%s.%s`" (project-id) dataset-id table-id)))

(s/defn ^:private create-table!
  [^String dataset-id :- su/NonBlankString
   table-id           :- su/NonBlankString
   field-name->type   :- {ValidFieldName (apply s/enum valid-field-types)}]
  (u/ignore-exceptions
   (delete-table! dataset-id table-id)
   (let [tbl-id (TableId/of dataset-id table-id)
         schema (Schema/of (u/varargs Field (for [[^String field-name field-type] field-name->type]
                                              (Field/of
                                                field-name
                                                (LegacySQLTypeName/valueOf (name field-type))
                                                (u/varargs Field [])))))
         tbl    (TableInfo/of tbl-id (StandardTableDefinition/of schema))]
     (.create (bigquery) tbl (u/varargs BigQuery$TableOption))))
  ;; now verify that the Table was created
  (.listTables (bigquery) dataset-id (u/varargs BigQuery$TableListOption))
  (println (u/format-color 'blue "Created BigQuery table `%s.%s.%s`." (project-id) dataset-id table-id)))

(defn- table-row-count ^Integer [^String dataset-id, ^String table-id]
  (let [sql                           (format "SELECT count(*) FROM `%s.%s.%s`" (project-id) dataset-id table-id)
        respond                       (fn [_ rows]
                                        (ffirst rows))
        client                        (bigquery)
        ^TableResult query-response   (#'bigquery/execute-bigquery client sql [] nil nil)]
    (#'bigquery/post-process-native (test-db-details) respond query-response (atom false))))

(defprotocol ^:private Insertable
  (^:private ->insertable [this]
   "Convert a value to an appropriate Google type when inserting a new row."))

(extend-protocol Insertable
  nil
  (->insertable [_] nil)

  Object
  (->insertable [this] this)

  clojure.lang.Keyword
  (->insertable [k]
    (u/qualified-name k))

  java.time.temporal.Temporal
  (->insertable [t] (u.date/format-sql t))

  ;; normalize to UTC. BigQuery normalizes it anyway and tends to complain when inserting values that have an offset
  java.time.OffsetDateTime
  (->insertable [t]
    (->insertable (t/local-date-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; for whatever reason the `date time zone-id` syntax that works in SQL doesn't work when loading data
  java.time.ZonedDateTime
  (->insertable [t]
    (->insertable (t/offset-date-time t)))

  ;; normalize to UTC, since BigQuery doesn't support TIME WITH TIME ZONE
  java.time.OffsetTime
  (->insertable [t]
    (u.date/format-sql (t/local-time (t/with-offset-same-instant t (t/zone-offset 0)))))

  ;; Convert the HoneySQL `timestamp(...)` form we sometimes use to wrap a `Timestamp` to a plain literal string
  honeysql.types.SqlCall
  (->insertable [{[{s :literal}] :args, fn-name :name}]
    (assert (= (name fn-name) "timestamp"))
    (->insertable (u.date/parse (str/replace s #"'" "")))))

(defn- ->json [row-map]
  (into {} (for [[k v] row-map]
             [(name k) (->insertable v)])))

(defn- rows->request ^InsertAllRequest [^String dataset-id ^String table-id row-maps]
  (let [insert-rows (map (fn [r]
                           (InsertAllRequest$RowToInsert/of (str (get r :id)) (->json r))) row-maps)]
    (InsertAllRequest/of (TableId/of dataset-id table-id) (u/varargs InsertAllRequest$RowToInsert insert-rows))))

(def ^:private max-rows-per-request
  "Max number of rows BigQuery lets us insert at once."
  10000)

(defn- insert-data! [^String dataset-id ^String table-id row-maps]
  {:pre [(seq dataset-id) (seq table-id) (sequential? row-maps) (seq row-maps) (every? map? row-maps)]}
  (doseq [chunk (partition-all max-rows-per-request row-maps)
          :let  [_                           (println (format
                                                        "Inserting %d rows like\n%s"
                                                        (count chunk)
                                                        (u/pprint-to-str (first chunk))))
                 req                         (rows->request dataset-id table-id chunk)
                 ^InsertAllResponse response (.insertAll (bigquery) req)]]
    (println (u/format-color 'blue "Sent request to insert %d rows into `%s.%s.%s`"
               (count (.getRows req))
               (project-id) dataset-id table-id))
    (when (seq (.getInsertErrors response))
      (println "Error inserting rows:" (u/pprint-to-str (seq (.getInsertErrors response))))
      (throw (ex-info "Error inserting rows"
                      {:errors                       (seq (.getInsertErrors response))
                       :metabase.util/no-auto-retry? true
                       :rows                         row-maps
                       :data                         (.getRows req)}))))
  ;; Wait up to 120 seconds for all the rows to be loaded and become available by BigQuery
  (let [max-wait-seconds   120
        expected-row-count (count row-maps)]
    (println (format "Waiting for %d rows to be loaded..." expected-row-count))
    (loop [seconds-to-wait-for-load max-wait-seconds]
      (let [actual-row-count (table-row-count dataset-id table-id)]
        (cond
          (= expected-row-count actual-row-count)
          (do
            (println (format "Loaded %d rows in %d seconds." expected-row-count (- max-wait-seconds seconds-to-wait-for-load)))
            :ok)

          (> seconds-to-wait-for-load 0)
          (do (Thread/sleep 1000)
              (print ".")
              (flush)
              (recur (dec seconds-to-wait-for-load)))

          :else
          (let [error-message (format "Failed to load table data for `%s.%s.%s`: expected %d rows, loaded %d"
                                      (project-id) dataset-id table-id expected-row-count actual-row-count)]
            (println (u/format-color 'red error-message))
            (throw (ex-info error-message {:metabase.util/no-auto-retry? true}))))))))

(defn base-type->bigquery-type [base-type]
  (let [types {:type/BigInteger     :INTEGER
               :type/Boolean        :BOOLEAN
               :type/Date           :DATE
               :type/DateTime       :DATETIME
               :type/DateTimeWithTZ :TIMESTAMP
               :type/Decimal        :NUMERIC
               :type/Dictionary     :RECORD
               :type/Float          :FLOAT
               :type/Integer        :INTEGER
               :type/Text           :STRING
               :type/Time           :TIME}]
    (or (get types base-type)
        (some base-type->bigquery-type (parents base-type)))))

(defn- fielddefs->field-name->base-type
  "Convert `field-definitions` to a format appropriate for passing to `create-table!`."
  [field-definitions]
  (into
   (ordered-map/ordered-map)
   (cons
    ["id" :INTEGER]
    (for [{:keys [field-name base-type]} field-definitions]
      [field-name (or (base-type->bigquery-type base-type)
                      (let [message (format "Don't know what BigQuery type to use for base type: %s" base-type)]
                        (println (u/format-color 'red message))
                        (throw (ex-info message {:metabase.util/no-auto-retry? true}))))]))))

(defn- tabledef->prepared-rows
  "Convert `table-definition` to a format approprate for passing to `insert-data!`."
  [{:keys [field-definitions rows]}]
  {:pre [(every? map? field-definitions) (sequential? rows) (seq rows)]}
  (let [field-names (map :field-name field-definitions)]
    (for [[i row] (m/indexed rows)]
      (assoc (zipmap field-names row)
             :id (inc i)))))

(defn- load-tabledef! [dataset-name {:keys [table-name field-definitions], :as tabledef}]
  (let [table-name (normalize-name :table table-name)]
    (create-table! dataset-name table-name (fielddefs->field-name->base-type field-definitions))
    ;; retry the `insert-data!` step up to 5 times because it seens to fail silently a lot. Since each row is given a
    ;; unique key it shouldn't result in duplicates.
    (loop [num-retries 5]
      (let [^Throwable e (try
                           (insert-data! dataset-name table-name (tabledef->prepared-rows tabledef))
                           nil
                           (catch Throwable e
                             e))]
        (when e
          (if (pos? num-retries)
            (recur (dec num-retries))
            (throw e)))))))

(defn- existing-dataset-names
  "Fetch a list of *all* dataset names that currently exist in the BQ test project."
  []
  (for [^Dataset dataset (.iterateAll (.listDatasets (bigquery) (into-array BigQuery$DatasetListOption [])))
        :let    [dataset-name (.. dataset getDatasetId getDataset)]]
    dataset-name))

;; keep track of databases we haven't created yet
(def ^:private existing-datasets
  "All datasets that already exist in the BigQuery cluster, so that we can possibly avoid recreating/repopulating them
  on every run."
  (atom #{}))

(defn- transient-dataset-outdated?
  "Checks whether the given `dataset-name` is a transient dataset that is outdated, and should be deleted.  Note that
  unlike `transient-dataset?`, this doesn't need any domain specific knowledge about which transient datasets are
  outdated. The fact that a *created* dataset (i.e. created on BigQuery) is transient has already been encoded by a
  suffix, so we can just look for that here."
  [dataset-name]
  (when-let [[_ ^String ds-timestamp-str] (re-matches #".*__transient_(\d+)$" dataset-name)]
    ;; millis to hours
    (< (* 1000 60 60 2) (- ns-load-time (Long. ds-timestamp-str)))))

(defmethod tx/create-db! :bigquery-cloud-sdk [_ {:keys [database-name table-definitions]} & _]
  {:pre [(seq database-name) (sequential? table-definitions)]}
  ;; fetch existing datasets if we haven't done so yet
  (when-not (seq @existing-datasets)
    (let [{transient-datasets true non-transient-datasets false} (group-by transient-dataset?
                                                                   (existing-dataset-names))]
      (reset! existing-datasets (set non-transient-datasets))
      (println "These BigQuery datasets have already been loaded:\n" (u/pprint-to-str (sort @existing-datasets)))
      (when-let [outdated-transient-datasets (seq (filter transient-dataset-outdated? transient-datasets))]
        (println (u/format-color
                   'blue
                   "These BigQuery datasets are transient, and more than two hours old; deleting them: %s`."
                   (u/pprint-to-str (sort outdated-transient-datasets))))
        (doseq [delete-ds outdated-transient-datasets]
          (u/ignore-exceptions
            (destroy-dataset! delete-ds))))))
  ;; now check and see if we need to create the requested one
  (let [database-name (normalize-name :db database-name)]
    (when-not (contains? @existing-datasets database-name)
      (u/ignore-exceptions
        (destroy-dataset! database-name))
      (u/auto-retry 2
        (try
          (println (format "Creating dataset %s..." (pr-str database-name)))
          ;; if the dataset failed to load successfully last time around, destroy whatever was loaded so we start
          ;; again from a blank slate
          (destroy-dataset! database-name)
          #_(u/ignore-exceptions
              (destroy-dataset! database-name))
          (create-dataset! database-name)
          ;; now create tables and load data.
          (doseq [tabledef table-definitions]
            (load-tabledef! database-name tabledef))
          (swap! existing-datasets conj database-name)
          (println (u/format-color 'green "Successfully created %s." (pr-str database-name)))
          (catch Throwable e
            (println (u/format-color 'red  "Failed to load BigQuery dataset %s." (pr-str database-name)))
            (println (u/pprint-to-str 'red (Throwable->map e)))
            ;; if creating the dataset ultimately fails to complete, then delete it so it will hopefully
            ;; work next time around
            (u/ignore-exceptions
              (destroy-dataset! database-name))
            (throw e)))))))

(defmethod tx/destroy-db! :bigquery-cloud-sdk
  [_ {:keys [database-name]}]
  (destroy-dataset! database-name)
  (when (seq @existing-datasets)
    (swap! existing-datasets disj database-name)))

(defmethod tx/aggregate-column-info :bigquery-cloud-sdk
  ([driver aggregation-type]
   (merge
    ((get-method tx/aggregate-column-info :sql-jdbc/test-extensions) driver aggregation-type)
    (when (#{:count :cum-count} aggregation-type)
      {:base_type :type/Integer})))

  ([driver aggregation-type field]
   (merge
    ((get-method tx/aggregate-column-info :sql-jdbc/test-extensions) driver aggregation-type field)
    ;; BigQuery averages, standard deviations come back as Floats. This might apply to some other ag types as well;
    ;; add them as we come across them.
    (when (#{:avg :stddev} aggregation-type)
      {:base_type :type/Float})
    (when (#{:count :cum-count} aggregation-type)
      {:base_type :type/Integer}))))
