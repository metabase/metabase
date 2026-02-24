(ns metabase-enterprise.product-analytics.storage.iceberg.writer
  "Writes event and session data to Iceberg tables as Parquet files."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.catalog :as iceberg.catalog]
   [metabase-enterprise.product-analytics.storage.iceberg.schema :as iceberg.schema]
   [metabase.util.log :as log])
  (:import
   (java.time Instant OffsetDateTime ZoneOffset)
   (java.util HashMap UUID)
   (org.apache.iceberg Schema Table)
   (org.apache.iceberg.catalog Catalog Namespace TableIdentifier)
   (org.apache.iceberg.data GenericRecord Record)
   (org.apache.iceberg.data.parquet GenericParquetWriter)
   (org.apache.iceberg.io DataWriter OutputFile)
   (org.apache.iceberg.parquet Parquet)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers -------------------------------------------------------

(def ^:private pa-namespace
  "Iceberg namespace for all product analytics tables."
  (Namespace/of (into-array String ["product_analytics"])))

(defn- table-identifier
  ^TableIdentifier [^String table-name]
  (TableIdentifier/of pa-namespace table-name))

(defn- ensure-namespace!
  "Create the namespace if it doesn't exist."
  [^Catalog catalog]
  (when-not (.namespaceExists catalog pa-namespace)
    (try
      (.createNamespace catalog pa-namespace (HashMap.))
      (catch org.apache.iceberg.exceptions.AlreadyExistsException _
        nil))))

(defn- ensure-table!
  "Create a table if it doesn't exist. Returns the Table instance."
  ^Table [^Catalog catalog ^String table-name ^Schema schema partition-spec]
  (let [tid (table-identifier table-name)]
    (if (.tableExists catalog tid)
      (.loadTable catalog tid)
      (try
        (.createTable catalog tid schema partition-spec)
        (catch org.apache.iceberg.exceptions.AlreadyExistsException _
          (.loadTable catalog tid))))))

(defn ensure-tables!
  "Idempotently create all product analytics Iceberg tables."
  []
  (let [catalog (iceberg.catalog/catalog)]
    (ensure-namespace! catalog)
    (doseq [[table-key {:keys [schema partition-spec]}] iceberg.schema/table-definitions
            :let [table-name (name table-key)]]
      (ensure-table! catalog table-name schema partition-spec)
      (log/debugf "Ensured Iceberg table: %s" table-name))))

;;; ------------------------------------------------- Conversion ----------------------------------------------------

(defn- to-offset-datetime
  "Convert a value to OffsetDateTime for Iceberg timestamp columns."
  [v]
  (cond
    (instance? OffsetDateTime v) v
    (instance? Instant v)        (.atOffset ^Instant v ZoneOffset/UTC)
    (instance? java.util.Date v) (.. ^java.util.Date v toInstant (atOffset ZoneOffset/UTC))
    (string? v)                  (OffsetDateTime/parse v)
    :else                        (.atOffset (Instant/now) ZoneOffset/UTC)))

(def ^:private timestamp-fields
  "Set of field names that are timestamp columns."
  #{"created_at" "updated_at" "date_value"})

(defn- map->record
  "Convert a Clojure map to an Iceberg GenericRecord using the given schema."
  ^GenericRecord [^Schema schema m]
  (let [record (GenericRecord/create schema)]
    (doseq [field (.columns schema)
            :let  [field-name (.name field)
                   v          (get m (keyword field-name))]]
      (when (some? v)
        (if (timestamp-fields field-name)
          (.setField record field-name (to-offset-datetime v))
          (.setField record field-name v))))
    record))

;;; --------------------------------------------------- Write -------------------------------------------------------

(defn- write-records!
  "Write a batch of GenericRecords to the given Iceberg table as a Parquet data file."
  [^Table table ^Schema schema records]
  (when (seq records)
    (let [file-name    (str (UUID/randomUUID) ".parquet")
          location     (str (.location table) "/data/" file-name)
          ^OutputFile  output-file (.newOutputFile (.io table) location)
          ^DataWriter  data-writer (-> (Parquet/writeData output-file)
                                       (.schema schema)
                                       (.createWriterFunc
                                        (reify java.util.function.Function
                                          (apply [_ msg-type]
                                            (GenericParquetWriter/buildWriter schema msg-type))))
                                       (.overwrite)
                                       (.withSpec (.spec table))
                                       (.build))]
      (try
        (doseq [^Record record records]
          (.write data-writer record))
        (finally
          (.close data-writer)))
      ;; Append the data file to the table
      (-> (.newAppend table)
          (.appendFile (.toDataFile data-writer))
          (.commit))
      (log/debugf "Wrote %d records to Iceberg table %s" (count records) (.name table)))))

(defn- load-table
  "Load an Iceberg table by its keyword name."
  ^Table [table-key]
  (let [catalog (iceberg.catalog/catalog)]
    (.loadTable catalog (table-identifier (name table-key)))))

(defn write-events!
  "Write a batch of event maps to the pa-events Iceberg table."
  [event-maps]
  (when (seq event-maps)
    (let [table   (load-table :pa-events)
          schema  iceberg.schema/events-schema
          records (mapv #(map->record schema %) event-maps)]
      (write-records! table schema records))))

(defn write-sessions!
  "Write a batch of session maps to the pa-sessions Iceberg table."
  [session-maps]
  (when (seq session-maps)
    (let [table   (load-table :pa-sessions)
          schema  iceberg.schema/sessions-schema
          records (mapv #(map->record schema %) session-maps)]
      (write-records! table schema records))))

(defn write-session-data!
  "Write a batch of session-data maps to the pa-session-data Iceberg table."
  [session-data-maps]
  (when (seq session-data-maps)
    (let [table   (load-table :pa-session-data)
          schema  iceberg.schema/session-data-schema
          records (mapv #(map->record schema %) session-data-maps)]
      (write-records! table schema records))))

(defn write-sites!
  "Write a batch of site maps to the pa-sites Iceberg table."
  [site-maps]
  (when (seq site-maps)
    (let [table   (load-table :pa-sites)
          schema  iceberg.schema/sites-schema
          records (mapv #(map->record schema %) site-maps)]
      (write-records! table schema records))))
