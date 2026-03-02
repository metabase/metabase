(ns metabase-enterprise.product-analytics.storage.iceberg.writer
  "Writes event and session data to Iceberg tables as Parquet files."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.catalog :as iceberg.catalog]
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.schema :as iceberg.schema]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.time Instant OffsetDateTime ZoneOffset)
   (java.util HashMap UUID)
   (org.apache.iceberg DataFile DeleteFile Files PartitionSpec Schema Table)
   (org.apache.iceberg.catalog Catalog Namespace SupportsNamespaces TableIdentifier)
   (org.apache.iceberg.data GenericRecord Record)
   (org.apache.iceberg.data.parquet GenericParquetWriter)
   (org.apache.iceberg.deletes EqualityDeleteWriter)
   (org.apache.iceberg.io DataWriter OutputFile)
   (org.apache.iceberg.parquet Parquet)
   (org.apache.iceberg.types Type$TypeID Types$NestedField)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Helpers -------------------------------------------------------

(def ^:private pa-namespace
  "Iceberg namespace for all product analytics tables."
  (Namespace/of (into-array String ["product_analytics"])))

(defn- table-identifier
  ^TableIdentifier [^String table-name]
  (TableIdentifier/of pa-namespace table-name))

(defn- ensure-namespace!
  "Create the namespace if it doesn't exist.
   Catches any exception from createNamespace (not just AlreadyExistsException) because
   the JDBC catalog may throw a raw PSQLException on duplicate key rather than wrapping it."
  [^SupportsNamespaces catalog]
  (when-not (.namespaceExists catalog pa-namespace)
    (try
      (.createNamespace catalog pa-namespace (HashMap.))
      (catch Exception _
        (when-not (.namespaceExists catalog pa-namespace)
          (throw (ex-info "Failed to create Iceberg namespace 'product_analytics'"
                          {:namespace "product_analytics"})))))))

(defn- ensure-table!
  "Create a table if it doesn't exist. Creates as format v2 (required for equality deletes).
   Returns the Table instance."
  ^Table [^Catalog catalog ^String table-name ^Schema schema partition-spec]
  (let [tid (table-identifier table-name)]
    (if (.tableExists catalog tid)
      (.loadTable catalog tid)
      (try
        (-> (.buildTable catalog tid schema)
            (.withPartitionSpec partition-spec)
            (.withProperty "format-version" "2")
            (.create))
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

(defn- coerce-value
  "Coerce a Clojure value to the expected Iceberg type."
  [^Types$NestedField field v]
  (let [type-id (.. field type typeId)]
    (cond
      (timestamp-fields (.name field))
      (to-offset-datetime v)

      (and (= org.apache.iceberg.types.Type$TypeID/INTEGER type-id) (instance? Long v))
      (int v)

      (and (= org.apache.iceberg.types.Type$TypeID/FLOAT type-id) (instance? Double v))
      (float v)

      :else
      v)))

(defn- map->record
  "Convert a Clojure map to an Iceberg GenericRecord using the given schema."
  ^GenericRecord [^Schema schema m]
  (let [record (GenericRecord/create schema)]
    (doseq [^Types$NestedField field (.columns schema)
            :let  [field-name (.name field)
                   v          (get m (keyword field-name))]]
      (when (some? v)
        (.setField record field-name (coerce-value field v))))
    record))

;;; --------------------------------------------------- Write -------------------------------------------------------

(defn- staging-output-file
  "Create an OutputFile that writes to a local temp file but reports the S3 location.
   This avoids Iceberg's S3FileIO (which uses chunked encoding that S3-compatible
   services like Garage don't support). After writing, the caller uploads the temp
   file with our own S3 client (which has chunked encoding disabled).
   Returns [output-file ^File temp-file]."
  [^String s3-location]
  (let [^File temp-file (File/createTempFile "iceberg-" ".parquet")
        delegate        (Files/localOutput temp-file)]
    [(reify OutputFile
       (create [_] (.create ^OutputFile delegate))
       (createOrOverwrite [_] (.createOrOverwrite ^OutputFile delegate))
       (location [_] s3-location)
       (toInputFile [_] (.toInputFile ^OutputFile delegate)))
     temp-file]))

(defn- write-data-file-native!
  "Write records to a Parquet file via Iceberg's S3FileIO. Returns the DataFile."
  ^DataFile [^Table table ^Schema schema records]
  (let [file-name    (str (UUID/randomUUID) ".parquet")
        s3-location  (str (.location table) "/data/" file-name)
        output-file  (.newOutputFile (.io table) s3-location)
        ^DataWriter  data-writer (-> (Parquet/writeData ^OutputFile output-file)
                                     (.schema schema)
                                     (.createWriterFunc
                                      (reify java.util.function.Function
                                        (apply [_ msg-type]
                                          (GenericParquetWriter/buildWriter ^org.apache.parquet.schema.MessageType msg-type))))
                                     (.overwrite)
                                     (.withSpec (PartitionSpec/unpartitioned))
                                     (.build))]
    (try
      (doseq [^Record record records]
        (.write data-writer record))
      (finally
        (.close data-writer)))
    (log/debugf "Wrote %d records to data file for %s (native)" (count records) (.name table))
    (.toDataFile data-writer)))

(defn- write-data-file-staged!
  "Write records to local temp file, upload to S3. Returns the DataFile."
  ^DataFile [^Table table ^Schema schema records]
  (let [file-name    (str (UUID/randomUUID) ".parquet")
        s3-location  (str (.location table) "/data/" file-name)
        [output-file
         ^File
         temp-file]  (staging-output-file s3-location)
        ^DataWriter  data-writer (-> (Parquet/writeData ^OutputFile output-file)
                                     (.schema schema)
                                     (.createWriterFunc
                                      (reify java.util.function.Function
                                        (apply [_ msg-type]
                                          (GenericParquetWriter/buildWriter ^org.apache.parquet.schema.MessageType msg-type))))
                                     (.overwrite)
                                     (.withSpec (PartitionSpec/unpartitioned))
                                     (.build))]
    (try
      (doseq [^Record record records]
        (.write data-writer record))
      (finally
        (.close data-writer)))
    (try
      (iceberg.s3/upload-file! s3-location temp-file)
      (log/debugf "Wrote %d records to data file for %s (staged)" (count records) (.name table))
      (.toDataFile data-writer)
      (finally
        (.delete temp-file)))))

(defn- write-data-file!
  "Write records as a Parquet DataFile. Dispatches native vs staged. Returns DataFile."
  ^DataFile [^Table table ^Schema schema records]
  (if (iceberg.settings/product-analytics-iceberg-s3-staging-uploads)
    (write-data-file-staged! table schema records)
    (write-data-file-native! table schema records)))

(defn- write-records!
  "Write a batch of GenericRecords to the given Iceberg table as a Parquet data file.
   Dispatches between native S3FileIO and staged upload based on settings."
  [^Table table ^Schema schema records]
  (when (seq records)
    (let [data-file (write-data-file! table schema records)]
      (-> (.newAppend table)
          (.appendFile data-file)
          (.commit)))))

;;; --------------------------------------------- Equality deletes ---------------------------------------------------

(defn- write-equality-delete-file-native!
  "Write an equality delete Parquet file via Iceberg's S3FileIO. Returns the DeleteFile.
   `delete-schema` is the schema containing only the equality field(s),
   `eq-field-ids` is a vector of field IDs, `field-name` is the delete field name,
   and `values` is a seq of values to delete on."
  ^DeleteFile [^Table table ^Schema delete-schema eq-field-ids ^String field-name values]
  (let [eq-field-ids-arr (int-array eq-field-ids)
        file-name        (str (UUID/randomUUID) "-deletes.parquet")
        s3-location      (str (.location table) "/data/" file-name)
        output-file      (.newOutputFile (.io table) s3-location)
        ^EqualityDeleteWriter writer
        (-> (Parquet/writeDeletes output-file)
            (.forTable table)
            (.rowSchema delete-schema)
            (.createWriterFunc
             (reify java.util.function.Function
               (apply [_ msg-type]
                 (GenericParquetWriter/buildWriter ^org.apache.parquet.schema.MessageType msg-type))))
            (.equalityFieldIds eq-field-ids-arr)
            (.overwrite)
            (.buildEqualityWriter))]
    (try
      (doseq [v values]
        (let [^GenericRecord record (GenericRecord/create delete-schema)]
          (.setField record field-name v)
          (.write writer record)))
      (finally
        (.close writer)))
    (.toDeleteFile writer)))

(defn- write-equality-delete-file-staged!
  "Write an equality delete Parquet file via staged upload. Returns the DeleteFile.
   `delete-schema` is the schema containing only the equality field(s),
   `eq-field-ids` is a vector of field IDs, `field-name` is the delete field name,
   and `values` is a seq of values to delete on."
  ^DeleteFile [^Table table ^Schema delete-schema eq-field-ids ^String field-name values]
  (let [eq-field-ids-arr (int-array eq-field-ids)
        file-name        (str (UUID/randomUUID) "-deletes.parquet")
        s3-location      (str (.location table) "/data/" file-name)
        [output-file
         ^File
         temp-file]      (staging-output-file s3-location)
        ^EqualityDeleteWriter writer
        (-> (Parquet/writeDeletes ^OutputFile output-file)
            (.forTable table)
            (.rowSchema delete-schema)
            (.createWriterFunc
             (reify java.util.function.Function
               (apply [_ msg-type]
                 (GenericParquetWriter/buildWriter ^org.apache.parquet.schema.MessageType msg-type))))
            (.equalityFieldIds eq-field-ids-arr)
            (.overwrite)
            (.buildEqualityWriter))]
    (try
      (doseq [v values]
        (let [^GenericRecord record (GenericRecord/create delete-schema)]
          (.setField record field-name v)
          (.write writer record)))
      (finally
        (.close writer)))
    (try
      (iceberg.s3/upload-file! s3-location temp-file)
      (.toDeleteFile writer)
      (finally
        (.delete temp-file)))))

(defn- write-equality-deletes!
  "Write an equality delete Parquet file for the given values.
   Returns the DeleteFile metadata for use with RowDelta."
  ^DeleteFile [^Table table ^Schema delete-schema eq-field-ids ^String field-name values]
  (if (iceberg.settings/product-analytics-iceberg-s3-staging-uploads)
    (write-equality-delete-file-staged! table delete-schema eq-field-ids field-name values)
    (write-equality-delete-file-native! table delete-schema eq-field-ids field-name values)))

(defn- load-table
  "Load an Iceberg table by its keyword name, creating it if necessary."
  ^Table [table-key]
  (let [catalog    (iceberg.catalog/catalog)
        table-name (name table-key)
        {:keys [schema partition-spec]} (get iceberg.schema/table-definitions table-key)]
    (ensure-namespace! catalog)
    (ensure-table! catalog table-name schema partition-spec)))

(defn write-events!
  "Write a batch of event maps to the pa-events Iceberg table."
  [event-maps]
  (when (seq event-maps)
    (let [table   (load-table :pa_events)
          schema  iceberg.schema/events-schema
          records (mapv #(map->record schema %) event-maps)]
      (write-records! table schema records))))

(defn write-sessions!
  "Write session records with equality deletes to deduplicate by session_uuid.
   Uses Iceberg v2 RowDelta to atomically delete existing rows for the given
   session_uuids and append the new rows."
  [session-maps]
  (when (seq session-maps)
    (let [table         (load-table :pa_sessions)
          schema        iceberg.schema/sessions-schema
          records       (mapv #(map->record schema %) session-maps)
          session-uuids (into [] (distinct) (map :session_uuid session-maps))
          data-file     (write-data-file! table schema records)
          delete-file   (write-equality-deletes! table
                                                 iceberg.schema/sessions-delete-schema
                                                 iceberg.schema/sessions-equality-field-ids
                                                 "session_uuid"
                                                 session-uuids)]
      (-> (.newRowDelta table)
          (.addDeletes delete-file)
          (.addRows data-file)
          (.commit)))))

(defn write-session-data!
  "Write a batch of session-data maps to the pa-session-data Iceberg table."
  [session-data-maps]
  (when (seq session-data-maps)
    (let [table   (load-table :pa_session_data)
          schema  iceberg.schema/session-data-schema
          records (mapv #(map->record schema %) session-data-maps)]
      (write-records! table schema records))))

(defn write-sites!
  "Write site records with equality deletes to deduplicate by uuid.
   Uses Iceberg v2 RowDelta to atomically delete existing rows for the given
   site uuids and append the new rows."
  [site-maps]
  (when (seq site-maps)
    (let [table       (load-table :pa_sites)
          schema      iceberg.schema/sites-schema
          records     (mapv #(map->record schema %) site-maps)
          site-uuids  (into [] (distinct) (map :uuid site-maps))
          data-file   (write-data-file! table schema records)
          delete-file (write-equality-deletes! table
                                               iceberg.schema/sites-delete-schema
                                               iceberg.schema/sites-equality-field-ids
                                               "uuid"
                                               site-uuids)]
      (-> (.newRowDelta table)
          (.addDeletes delete-file)
          (.addRows data-file)
          (.commit)))))
