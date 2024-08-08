(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data :as data]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.events :as events]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.util :as lib.util]
   [metabase.models :refer [Database]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.table :as table]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.upload.types :as upload-types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (org.apache.tika Tika)))

(set! *warn-on-reflection* true)

;; TODO: move these to a more appropriate namespace if they need to be reused
(defmulti max-bytes
  "This tracks the size of various text fields in bytes."
  {:arglists '([model column])}
  (fn [model _column] model))

(defmethod max-bytes :model/Table [_ column]
  (case column
    :display_name 256
    :name 256))

(defmethod max-bytes :model/Field [_ column]
  (case column
    :name 254))

(defmethod max-bytes :model/Card  [_ column]
  (case column
    :name 254))

(def ^:private min-safe (fnil min Long/MAX_VALUE Long/MAX_VALUE))

(defn- max-column-bytes [driver]
  (let [column-limit (some-> driver driver/column-name-length-limit)]
    (min-safe column-limit (max-bytes :model/Field :name))))

(defn- normalize-column-name
  [driver raw-name]
  (if (str/blank? raw-name)
    "unnamed_column"
    (u/slugify (str/trim raw-name)
               ;; since slugified names contain only ASCII characters, we can conflate bytes and length here.
               {:max-length (max-column-bytes driver)})))

(def auto-pk-column-name
  "The lower-case name of the auto-incrementing PK column. The actual name in the database could be in upper-case."
  "_mb_row_id")

(def auto-pk-column-keyword
  "The keyword of the auto-incrementing PK column."
  (keyword auto-pk-column-name))

(defn- table-id->auto-pk-column [driver table-id]
  (first (filter (fn [field]
                   (= (normalize-column-name driver (:name field)) auto-pk-column-name))
                 (t2/select :model/Field :table_id table-id :active true))))

(defn- detect-schema
  "Consumes the header and rows from a CSV file.

   Returns an ordered map of normalized-column-name -> type for the given CSV file. Supported types include `::int`,
   `::datetime`, etc. A column that is completely blank is assumed to be of type `::text`."
  [settings unique-header rows]
  (let [column-count        (count unique-header)
        initial-types       (repeat column-count nil)
        col-name+type-pairs (->> (upload-types/column-types-from-rows settings initial-types rows)
                                 (map vector unique-header))]
    (ordered-map/ordered-map col-name+type-pairs)))

;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

(def ^:private last-timestamp (atom (t/local-date-time)))

(set! *warn-on-reflection* true)

(defn- strictly-monotonic-now
  "Return an adjusted version of the current time, that it is guaranteed to never repeat the last second."
  []
  (swap! last-timestamp
         (fn [prev-timestamp]
           (t/max
             (t/local-date-time)
             (-> prev-timestamp
                 (t/plus (t/seconds 1))
                 (t/truncate-to :seconds))))))

(defn- unique-table-name
  "Append the current datetime to the given name to create a unique table name. The resulting name will be short enough for the given driver (truncating the supplied `table-name` if necessary)."
  [driver table-name]
  (let [time-format                 "_yyyyMMddHHmmss"
        slugified-name               (or (u/slugify table-name) "")
        ;; since both the time-format and the slugified-name contain only ASCII characters, we can behave as if
        ;; [[driver/table-name-length-limit]] were defining a length in characters.
        max-length                  (- (min-safe (driver/table-name-length-limit driver)
                                                 (max-bytes :model/Table :name))
                                       (count time-format))
        acceptable-length           (min (count slugified-name) max-length)
        truncated-name-without-time (subs slugified-name 0 acceptable-length)]
    (str truncated-name-without-time
         (t/format time-format (strictly-monotonic-now)))))

(mu/defn- database-type
  [driver
   column-type :- (into [:enum] upload-types/column-types)]
  (let [external-type (keyword "metabase.upload" (name column-type))]
    (driver/upload-type->database-type driver external-type)))

(defn- defaulting-database-type [driver upload-type]
  (or (database-type driver upload-type)
      (database-type driver ::upload-types/varchar-255)))

(defn- column-definitions
  "Returns a map of column-name -> column-definition from a map of column-name -> upload-type."
  [driver col->upload-type]
  (update-vals col->upload-type (partial defaulting-database-type driver)))

(defn current-database
  "The database being used for uploads."
  []
  (t2/select-one Database :uploads_enabled true))

(mu/defn table-identifier :- :string
  "Returns a string that can be used as a table identifier in SQL, including a schema if provided."
  [{:keys [schema name] :as _table}
   :- [:map
       [:schema {:optional true} [:maybe :string]]
       [:name :string]]]
  (if (str/blank? schema)
    name
    (str schema "." name)))

(defn- parse-rows
  "Returns a lazy seq of parsed rows, given a sequence of upload types for each column.
  Empty strings are parsed as nil."
  [settings col-upload-types rows]
  (let [parsers (map #(upload-parsing/upload-type->parser % settings) col-upload-types)]
    (for [row rows]
      (for [[value parser] (u/map-all vector row parsers)]
        (do
          (when-not parser
            (throw (ex-info (format "Column count in data (%s) exceeds the number of in the header (%s)"
                                    (count rows)
                                    (count parsers))
                            {:settings settings
                             :col-upload-types rows
                             :row row})))
          (when-not (str/blank? value)
            (parser value)))))))

(defn- remove-indices
  "Removes the elements at the given indices from the collection. Indices is a set."
  [indices coll]
  (keep-indexed (fn [idx item]
                  (when-not (contains? indices idx)
                    item))
                coll))

(defn- indices-where
  "Returns a lazy seq of the indices where the predicate is true."
  [pred coll]
  (keep-indexed (fn [idx item]
                  (when (pred item)
                    idx))
                coll))

(defn- auto-pk-column-indices
  "Returns the indices of columns that have the same normalized name as [[auto-pk-column-name]]"
  [header]
  ;; We don't need to pass the driver, as we are comparing to auto-pk-column-name, which does not need to be truncated.
  (let [driver nil]
    (set (indices-where #(= auto-pk-column-name (normalize-column-name driver %)) header))))

(defn- without-auto-pk-columns
  [header-and-rows]
  (let [header (first header-and-rows)
        auto-pk-indices (auto-pk-column-indices header)]
    (cond->> header-and-rows
      auto-pk-indices
      (map (partial remove-indices auto-pk-indices)))))

(defn- file-size-mb [csv-file]
  (/ (.length ^File csv-file) 1048576.0))

(def ^:private separators ",;\t")

;; This number was chosen arbitrarily. There is robustness / performance trade-off.
(def ^:private max-inferred-lines 10)

(defn- separator-priority
  "Prefer separators according to the follow criteria, in order:

   - Splitting the header at least once.
   - Giving a consistent column split for all the lines.
   - Not having more columns in any row than in the header.
   - The maximum number of column splits.
   - The number of fields in the header.
   - The precedence order in how we define them, e.g. a bias towards comma.

  This last preference is implicit in the order of [[separators]]"
  [[header-column-count & data-row-column-counts]]
  [(when header-column-count
     (> header-column-count 1))
   (apply = header-column-count data-row-column-counts)
   (not (some #(> % header-column-count) data-row-column-counts))
   (reduce max 0 data-row-column-counts)
   header-column-count])

(def ^:private allowed-extensions #{nil "csv" "tsv" "txt"})

(def ^:private allowed-mime-types #{"text/csv" "text/tab-separated-values" "text/plain"})

(def ^:private ^Tika tika (Tika.))

(defn- file-extension [filename]
  (when filename
    (-> filename (str/split #"\.") rest last)))

(defn- file-mime-type [^File file]
  (.detect tika file))

(defn- infer-separator
  "Guess at what symbol is being used as a separator in the given CSV-like file.
  Our heuristic is to use the separator that gives us the most number of columns.
  Exclude separators which give incompatible column counts between the header and the first row."
  [readable]
  (let [count-columns (fn [s]
                        ;; Create a separate reader per separator, as the line-breaking behavior depends on the parser.
                        (with-open [reader (bom/bom-reader readable)]
                          (try (into []
                                     (comp (take max-inferred-lines)
                                           (map count))
                                     (csv/read-csv reader :separator s))
                               (catch Exception _e nil))))]
    (->> (map (juxt identity count-columns) separators)
         (sort-by (comp separator-priority second) u/reverse-compare)
         ffirst)))

(defn- infer-parser
  "Currently this only infers the separator, but in future it may also handle different quoting options."
  [filename ^File file]
  (let [s (if (= "tsv" (file-extension filename))
            \tab
            (infer-separator file))]
    (fn [stream]
      (csv/read-csv stream :separator s))))

(defn- columns-with-auto-pk [columns]
  (merge (ordered-map/ordered-map auto-pk-column-keyword ::upload-types/auto-incrementing-int-pk) columns))

(defn- auto-pk-column?
  "Returns true if there should be an auto-incrementing primary key column in any table created or updated from an
   upload."
  [driver db]
  (driver.u/supports? driver :upload-with-auto-pk db))

(defn- unique-alias-fn [driver]
  (let [max-length (max-column-bytes driver)]
    (fn [base suffix]
      (as-> (str base "_" suffix) %
            (driver/escape-alias driver %)
            (lib.util/truncate-alias % max-length)))))

(defn- derive-column-names [driver header]
  (let [generator-fn (mbql.u/unique-name-generator :unique-alias-fn (unique-alias-fn driver))]
    (mapv (comp keyword generator-fn)
          (for [h header] (normalize-column-name driver h)))))

(defn- create-from-csv!
  "Creates a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db table-name filename ^File csv-file]
  (let [parse (infer-parser filename csv-file)]
    (with-open [reader (bom/bom-reader csv-file)]
      (let [auto-pk?          (auto-pk-column? driver db)
            [header & rows]   (cond-> (parse reader)
                                auto-pk?
                                without-auto-pk-columns)
            settings          (upload-parsing/get-settings)
            column-names      (derive-column-names driver header)
            cols->upload-type (detect-schema settings column-names rows)
            col-definitions   (column-definitions driver (cond-> cols->upload-type
                                                           auto-pk?
                                                           columns-with-auto-pk))
            csv-col-names     (keys cols->upload-type)
            col-upload-types  (vals cols->upload-type)
            parsed-rows       (vec (parse-rows settings col-upload-types rows))]
        (driver/create-table! driver
                              (:id db)
                              table-name
                              col-definitions
                              (when auto-pk?
                                {:primary-key [auto-pk-column-keyword]}))
        (try
          (driver/insert-into! driver (:id db) table-name csv-col-names parsed-rows)
          {:num-rows          (count rows)
           :num-columns       (count cols->upload-type)
           :generated-columns (if auto-pk? 1 0)
           :size-mb           (file-size-mb csv-file)}
          (catch Throwable e
            (driver/drop-table! driver (:id db) table-name)
            (throw (ex-info (ex-message e) {:status-code 400}))))))))

;;;; +------------------+
;;;; |  Create upload
;;;; +------------------+

(def ^:dynamic *auxiliary-sync-steps*
  "For testing purposes, we'd like to control whether the analyze and field values steps of sync are run synchronously, or not at all.
   In production this should always be asynchronous, so users can use the table earlier."
  :asynchronous)

(defn- scan-and-sync-table!
  [database table]
  (sync-fields/sync-fields-for-table! database table)
  (case *auxiliary-sync-steps*
    :asynchronous (future (sync/sync-table! table))
    :synchronous (sync/sync-table! table)
    :never nil))

(defn- uploads-enabled? []
  (some? (:db_id (public-settings/uploads-settings))))

(defn- can-use-uploads-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database for the subset of reasons common to all uploads
  entry points. Returns nil otherwise."
  [db]
  (let [driver (driver.u/database->driver db)]
    (cond
      (not (uploads-enabled?))
      (ex-info (tru "Uploads are not enabled.")
               {:status-code 422})

      (premium-features/sandboxed-user?)
      (ex-info (tru "Uploads are not permitted for sandboxed users.")
               {:status-code 403})

      (not (driver.u/supports? driver :uploads db))
      (ex-info (tru "Uploads are not supported on {0} databases." (str/capitalize (name driver)))
               {:status-code 422}))))

(defn- can-create-upload-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database and schema. Returns nil otherwise."
  [db schema-name]
  (or (cond
        (not (:uploads_enabled db))
        (ex-info (tru "Uploads are not enabled.")
                 {:status-code 422})
        (and (str/blank? schema-name)
             (driver.u/supports? (driver.u/database->driver db) :schemas db))
        (ex-info (tru "A schema has not been set.")
                 {:status-code 422})
        (not
         (and
          (= :unrestricted (data-perms/full-db-permission-for-user api/*current-user-id*
                                                                   :perms/view-data
                                                                   (u/the-id db)))
          ;; previously this required `unrestricted` data access, i.e. not `no-self-service`, which corresponds to *both*
          ;; (at least) `:query-builder` plus unrestricted view-data
          (contains? #{:query-builder :query-builder-and-native}
                     (data-perms/full-schema-permission-for-user api/*current-user-id*
                                                                 :perms/create-queries
                                                                 (u/the-id db)
                                                                 schema-name))))
        (ex-info (tru "You don''t have permissions to do that.")
                 {:status-code 403})
        (and (some? schema-name)
             (not (driver.s/include-schema? db schema-name)))
        (ex-info (tru "The schema {0} is not syncable." schema-name)
                 {:status-code 422}))
   (can-use-uploads-error db)))

(defn- check-can-create-upload
  "Throws an error if the user cannot upload to the given database and schema."
  [db schema-name]
  (when-let [error (can-create-upload-error db schema-name)]
    (throw error)))

(defn can-create-upload?
  "Returns true if the user can upload to the given database and schema, and false otherwise."
  [db schema-name]
  (nil? (can-create-upload-error db schema-name)))

;;; +-----------------------------------------
;;; |  public interface for creating CSV table
;;; +-----------------------------------------

(defn- fail-stats
  "If a given upload / append / replace fails, this function is used to create the failure event payload for snowplow.
  It may involve redundantly reading the file, or even failing again if the file is unreadable."
  [filename ^File file]
  (let [parse (infer-parser filename file)]
    (with-open [reader (bom/bom-reader file)]
      (let [rows (parse reader)]
        {:size-mb           (file-size-mb file)
         :num-columns       (count (first rows))
         :num-rows          (count (rest rows))
         :generated-columns 0}))))

(defn- create-from-csv-and-sync!
  "This is separated from `create-csv-upload!` for testing"
  [{:keys [db filename file schema table-name display-name]}]
  (let [driver            (driver.u/database->driver db)
        schema            (some->> schema (ddl.i/format-name driver))
        table-name        (some->> table-name (ddl.i/format-name driver))
        schema+table-name (table-identifier {:schema schema :name table-name})
        stats             (create-from-csv! driver db schema+table-name filename file)
        ;; Sync immediately to create the Table and its Fields; the scan is settings-dependent and can be async
        table             (sync-tables/create-table! db {:name         table-name
                                                         :schema       (not-empty schema)
                                                         :display_name display-name})
        _set_is_upload    (t2/update! :model/Table (:id table) {:is_upload true})
        _sync             (scan-and-sync-table! db table)
        ;; Set the display_name of the auto-generated primary key column to the same as its name, so that if users
        ;; download results from the table as a CSV and reupload, we'll recognize it as the same column
        _ (when (auto-pk-column? driver db)
            (let [auto-pk-field (table-id->auto-pk-column driver (:id table))]
              (t2/update! :model/Field (:id auto-pk-field) {:display_name (:name auto-pk-field)})))]
    {:table table
     :stats stats}))

(defn- check-filetype [filename file]
  (let [extension (file-extension filename)]
    (when-not (contains? allowed-extensions extension)
      (throw (ex-info (tru "Unsupported File Type")
                      {:status-code    415 ; Unsupported Media Type
                       :file-extension extension})))
    ;; This might be expensive to compute, hence having this as a second case.
    (let [mime-type (file-mime-type file)]
      (when-not (contains? allowed-mime-types mime-type)
        (throw (ex-info (tru "Unsupported File Type")
                        {:status-code    415 ; Unsupported Media Type
                         :file-extension extension
                         :mime-type      mime-type}))))))

(mu/defn create-csv-upload!
  "Main entry point for CSV uploading.

  What it does:
  - throws an error if the user cannot upload to the given database and schema (see [[can-create-upload-error]] for reasons)
  - throws an error if the user has write permissions to the given collection
  - detects the schema of the CSV file
  - inserts the data into a new table with a unique name, along with an extra auto-generated primary key column
  - syncs and scans the table
  - creates a model which wraps the table

  Requires that current-user dynamic vars in [[metabase.api.common]] are bound as if by API middleware (this is
  needed for QP permissions checks).
  Returns the newly created model. May throw validation, permimissions, or DB errors.

  Args:
  - `collection-id`: the ID of the collection to create the model in. `nil` means the root collection.
  - `filename`: the name of the file being uploaded.
  - `file`: the file being uploaded.
  - `db-id`: the ID of the database to upload to.
  - `schema-name`: the name of the schema to create the table in (optional).
  - `table-prefix`: the prefix to use for the table name (optional)."
  [{:keys [collection-id filename ^File file db-id schema-name table-prefix]}
   :- [:map
       [:collection-id [:maybe ms/PositiveInt]]
       [:filename :string]
       [:file (ms/InstanceOfClass File)]
       [:db-id ms/PositiveInt]
       [:schema-name {:optional true} [:maybe :string]]
       [:table-prefix {:optional true} [:maybe :string]]]]
  (let [database (or (t2/select-one Database :id db-id)
                     (throw (ex-info (tru "The uploads database does not exist.")
                                     {:status-code 422})))]
    (check-can-create-upload database schema-name)
    (check-filetype filename file)
    (collection/check-write-perms-for-collection collection-id)
    (try
      (let [timer             (u/start-timer)
            filename-prefix   (or (second (re-matches #"(.*)\.(csv|tsv)$" filename))
                                  filename)
            humanized-name    (humanization/name->human-readable-name filename-prefix)
            display-name      (u/truncate-string-to-byte-count humanized-name (max-bytes :model/Table :display_name))
            card-name         (u/truncate-string-to-byte-count humanized-name (max-bytes :model/Card :name))
            driver            (driver.u/database->driver database)
            table-name        (->> (str table-prefix display-name)
                                   (unique-table-name driver)
                                   (u/lower-case-en))
            {:keys [stats
                    table]}   (create-from-csv-and-sync! {:db           database
                                                          :filename     filename
                                                          :file         file
                                                          :schema       schema-name
                                                          :table-name   table-name
                                                          :display-name display-name})
            card              (card/create-card!
                               {:collection_id          collection-id
                                :type                   :model
                                :database_id            (:id database)
                                :dataset_query          {:database (:id database)
                                                         :query    {:source-table (:id table)}
                                                         :type     :query}
                                :display                :table
                                :name                   card-name
                                :visualization_settings {}}
                               @api/*current-user*)
            upload-seconds    (/ (u/since-ms timer) 1e3)
            stats             (assoc stats :upload-seconds upload-seconds)]

        (events/publish-event! :event/upload-create
                               {:user-id  (:id @api/*current-user*)
                                :model-id (:id table)
                                :model    :model/Table
                                :details  {:db-id       db-id
                                           :schema-name schema-name
                                           :table-name  table-name
                                           :model-id    (:id card)
                                           :stats       stats}})

        (snowplow/track-event! ::snowplow/csv-upload-successful api/*current-user-id*
                               (assoc stats :model-id (:id card)))
        card)
      (catch Throwable e
        (snowplow/track-event! ::snowplow/csv-upload-failed api/*current-user-id* (fail-stats filename file))
        (throw e)))))

;;; +-----------------------------
;;; |  appending to uploaded table
;;; +-----------------------------

(defn- not-blank [s]
  (when-not (str/blank? s)
    s))

(defn- extra-and-missing-error-markdown [extra missing]
  (when (seq missing)
    (->> [[(tru "The CSV file is missing columns that are in the table:") missing]
          ;; Even though we allow new columns to be implicitly added by uploads, we mention then in the error messages
          ;; for missing fields as a common case will be the misspelling of names. Seeing the actual and expected
          ;; names together could help customers spot the root cause more easily.
          [(tru "There are new columns in the CSV file that are not in the table:") extra]]
         (keep (fn [[header columns]]
                 (when (seq columns)
                   (str/join "\n" (cons header (map #(str "- " %) columns))))))
         (str/join "\n\n")
         (not-blank))))

(defn- check-schema
  "Throws an exception if:
    - the CSV file contains duplicate column names
    - the schema of the CSV file does not match the schema of the table

    Note that we do not require the column ordering to be consistent between the header and the table schema."
  [fields-by-normed-name normalized-header]
  ;; Assumes table-cols are unique when normalized
  (let [normalized-field-names (keys fields-by-normed-name)
        [extra missing _both]  (data/diff (set normalized-header) (set normalized-field-names))]
    ;; check for duplicates
    (when (some #(< 1 %) (vals (frequencies normalized-header)))
      (throw (ex-info (tru "The CSV file contains duplicate column names.")
                      {:status-code 422})))
    (when-let [error-message (extra-and-missing-error-markdown extra missing)]
      (throw (ex-info error-message {:status-code 422})))))

(defn- field-changes
  "Given existing and newly inferred types for the given `field-names`, calculate which fields need to be added or updated, along with their new types."
  [field-names existing-types new-types]
  (reduce
   (fn [m [f e n]]
     (cond
       (nil? e)   (assoc-in m [:added f] n)
       (not= e n) (assoc-in m [:updated f] n)
       :else      m))
   {:added {}, :updated {}}
   (map vector field-names existing-types new-types)))

(defn- field->db-type [driver field->col-type]
  (m/map-kv
   (fn [field-name col-type]
     [(keyword field-name)
      (database-type driver col-type)])
   field->col-type))

(defn- add-columns! [driver database table field->type & args]
  (when (seq field->type)
    (apply driver/add-columns! driver (:id database) (table-identifier table)
           (field->db-type driver field->type)
           args)))

(defn- alter-columns! [driver database table field->new-type & args]
  (when (seq field->new-type)
    (apply driver/alter-columns! driver (:id database) (table-identifier table)
           (field->db-type driver field->new-type)
           args)))

(defn- mbql? [model]
  (= "query" (name (:query_type model "query"))))

(defn- no-joins?
  "Returns true if `query` has no explicit joins in it, otherwise false."
  [query]
  ;; TODO while it's unlikely (at the time of writing this) that uploaded tables have FKs, we should probably check
  ;;      for implicit joins as well.
  (->> (range (lib/stage-count query))
       (not-any? (fn [stage-idx]
                   (lib/joins query stage-idx)))))

(defn- only-table-id
  "For models that depend on only one table, return its id, otherwise return nil. Doesn't support native queries."
  [model]
  ; dataset_query can be empty in tests
  (when-let [query (some-> model :dataset_query lib/->pMBQL not-empty)]
    (when (and (mbql? model) (no-joins? query))
      (lib/source-table-id query))))

(defn- invalidate-cached-models!
  "Invalidate the model caches for all cards whose `:based_on_upload` value resolves to the given table."
  [table]
  ;; NOTE: It is important that this logic is kept in sync with `model-hydrate-based-on-upload`
  (when-let [model-ids (->> (t2/select [:model/Card :id :dataset_query]
                                       :table_id (:id table)
                                       :type     :model
                                       :archived false)
                            (filter (comp #{(:id table)} only-table-id))
                            (map :id)
                            seq)]
    ;; Ideally we would do all the filtering in the query, but this would not allow us to leverage mlv2.
    (persisted-info/invalidate! {:card_id [:in model-ids]})))

(defn- update-with-csv! [database table filename file & {:keys [replace-rows?]}]
  (try
    (let [parse (infer-parser filename file)]
      (with-open [reader (bom/bom-reader file)]
        (let [timer              (u/start-timer)
              driver             (driver.u/database->driver database)
              auto-pk?           (auto-pk-column? driver database)
              [header & rows]    (cond-> (parse reader)
                                   auto-pk?
                                   without-auto-pk-columns)
              normed-name->field (m/index-by #(normalize-column-name driver (:name %))
                                             (t2/select :model/Field :table_id (:id table) :active true))
              normalized-header  (for [h header] (normalize-column-name driver h))
              create-auto-pk?    (and
                                  auto-pk?
                                  (driver/create-auto-pk-with-append-csv? driver)
                                  (not (contains? normed-name->field auto-pk-column-name)))
              normed-name->field (cond-> normed-name->field auto-pk? (dissoc auto-pk-column-name))
              _                  (check-schema normed-name->field normalized-header)
              settings           (upload-parsing/get-settings)
              old-types          (map (comp upload-types/base-type->upload-type :base_type normed-name->field) normalized-header)
              ;; in the happy, and most common, case all the values will match the existing types
              ;; for now we just plan for the worst and perform a fairly expensive operation to detect any type changes
              ;; we can come back and optimize this to an optimistic-with-fallback approach later.
              detected-types     (upload-types/column-types-from-rows settings old-types rows)
              new-types          (map upload-types/new-type old-types detected-types)
              ;; avoid any schema modification unless all the promotions required by the file are supported,
              ;; choosing to not promote means that we will defer failure until we hit the first value that cannot
              ;; be parsed as its existing type - there is scope to improve these error messages in the future.
              modify-schema?     (and (not= old-types new-types) (= detected-types new-types))
              _                  (when modify-schema?
                                   (let [changes (field-changes normalized-header old-types new-types)]
                                     (add-columns! driver database table (:added changes))
                                     (alter-columns! driver database table (:updated changes))))
              ;; this will fail if any of our required relaxations were rejected.
              parsed-rows        (parse-rows settings new-types rows)
              row-count          (count parsed-rows)
              stats              {:num-rows          row-count
                                  :num-columns       (count new-types)
                                  :generated-columns (if create-auto-pk? 1 0)
                                  :size-mb           (file-size-mb file)
                                  :upload-seconds    (u/since-ms timer)}]
          (try
            (when replace-rows?
              (driver/truncate! driver (:id database) (table-identifier table)))
            (driver/insert-into! driver (:id database) (table-identifier table) normalized-header parsed-rows)
            (catch Throwable e
              (throw (ex-info (ex-message e) {:status-code 422}))))

          (when create-auto-pk?
            (add-columns! driver database table
                          {auto-pk-column-keyword ::upload-types/auto-incrementing-int-pk}
                          :primary-key [auto-pk-column-keyword]))

          (scan-and-sync-table! database table)

          (when create-auto-pk?
            (let [auto-pk-field (table-id->auto-pk-column driver (:id table))]
              (t2/update! :model/Field (:id auto-pk-field) {:display_name (:name auto-pk-field)})))

          (invalidate-cached-models! table)

          (events/publish-event! :event/upload-append
                                 {:user-id  (:id @api/*current-user*)
                                  :model-id (:id table)
                                  :model    :model/Table
                                  :details  {:db-id       (:id database)
                                             :schema-name (:schema table)
                                             :table-name  (:name table)
                                             :stats       stats}})

          (snowplow/track-event! ::snowplow/csv-append-successful api/*current-user-id* stats)

          {:row-count row-count})))
    (catch Throwable e
      (snowplow/track-event! ::snowplow/csv-append-failed api/*current-user-id* (fail-stats filename file))
      (throw e))))

(defn- can-update-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database and schema. Returns nil otherwise."
  [db table]
  (or (can-use-uploads-error db)
      (cond
        (not (:is_upload table))
        (ex-info (tru "The table must be an uploaded table.")
                 {:status-code 422})

        (not (mi/can-read? table))
        (ex-info (tru "You don''t have permissions to do that.")
                 {:status-code 403}))))

(defn- check-can-update
  "Throws an error if the user cannot upload to the given database and schema."
  [db table]
  (when-let [error (can-update-error db table)]
    (throw error)))

(defn- can-upload-to-table?
  "Returns true if the user can upload to the given database and table, and false otherwise."
  [db table]
  (nil? (can-update-error db table)))

(defn- can-delete-error
  "Returns an ExceptionInfo object if the user cannot delete the given upload. Returns nil otherwise."
  [table]
  (cond
    (not (:is_upload table))
    (ex-info (tru "The table must be an uploaded table.")
             {:status-code 422})

    (not (mi/can-write? table))
    (ex-info (tru "You don''t have permissions to do that.")
             {:status-code 403})))

(defn- check-can-delete
  "Throws an error if the given table is not an upload, or if the user does not have permission to delete it."
  [table]
  ;; For now anyone that can update a table is allowed to delete it.
  (when-let [error (can-delete-error table)]
    (throw error)))

;;; +--------------------------------------------------
;;; |  public interface for updating an uploaded table
;;; +--------------------------------------------------

(defn delete-upload!
  "Delete the given table from both the app-db and the customer database."
  [table & {:keys [archive-cards?]}]
  (let [database   (table/database table)
        driver     (driver.u/database->driver database)
        table-name (table-identifier table)]
    (check-can-delete table)

    ;; Attempt to delete the underlying data from the customer database.
    ;; We perform this before marking the table as inactive in the app db so that even if it false, the table is still
    ;; visible to administrators, and the operation is easy to retry again later.
    (driver/drop-table! driver (:id database) table-name)

    ;; We mark the table as inactive synchronously, so that it will no longer shows up in the admin list.
    (t2/update! :model/Table :id (:id table) {:active false})

    ;; Ideally we would immediately trigger any further clean-up associated with the table being deactivated, but at
    ;; the time of writing this sync isn't wired up to do anything with explicitly inactive tables, and rather
    ;; relies on their absence from the tables being described during the database sync itself.
    ;; TODO update the [[metabase.sync]] module to support direct per-table clean-up
    ;; Ideally this will also clean up more the metadata which we had created around it, e.g. advanced field values.
    #_(future (sync/retire-table! (assoc table :active false)))

    ;; Archive the related cards if the customer opted in.
    ;;
    ;; For now, this only covers instances where the card has this as its "primary table", i.e.
    ;; 1. A MBQL question or model that has this table as their first or only data source, or
    ;; 2. A MBQL question or model that depends on such a model as their first or only data source.
    ;; Note that this does not include cases where we join to this table, or even native queries which depend .
    (when archive-cards?
      (t2/update-returning-pks! :model/Card
                                {:table_id (:id table) :archived false}
                                {:archived true}))

    :done))

(def update-action-schema
  "The :action values supported by [[update-csv!]]"
  [:enum ::append ::replace])

(mu/defn update-csv!
  "Main entry point for updating an uploaded table with a CSV file.
  This will create an auto-incrementing primary key (auto-pk) column in the table for drivers that supported uploads
  before auto-pk columns were introduced by metabase#36249, if it does not already exist."
  [{:keys [filename ^File file table-id action]}
   :- [:map
       [:table-id ms/PositiveInt]
       [:filename :string]
       [:file (ms/InstanceOfClass File)]
       [:action update-action-schema]]]
  (let [table    (api/check-404 (t2/select-one :model/Table :id table-id))
        database (table/database table)
        replace? (= ::replace action)]
    (check-can-update database table)
    (check-filetype filename file)
    (update-with-csv! database table filename file :replace-rows? replace?)))

;;; +--------------------------------
;;; |  hydrate based_on_upload for FE
;;; +--------------------------------

(defn- uploadable-table-ids
  "Returns the subset of table ids where the user can upload to the table."
  [table-ids]
  (set (when (seq table-ids)
         (->> (t2/hydrate (t2/select :model/Table :id [:in table-ids]) :db)
              (filter #(can-upload-to-table? (:db %) %))
              (map :id)))))

(mu/defn model-hydrate-based-on-upload
  "Batch hydrates `:based_on_upload` for each item of `models`. Assumes each item of `model` represents a model."
  [models :- [:sequential [:map
                           ;; query_type and dataset_query can be null in tests, so we make them nullable here.
                           ;; they should never be null in production
                           [:dataset_query [:maybe ms/Map]]
                           [:query_type    [:maybe [:or :string :keyword]]]
                           [:table_id      [:maybe ms/PositiveInt]]
                           ;; is_upload can be provided for an optional optimization
                           [:is_upload {:optional true} [:maybe :any]]]]]
  (let [table-ids             (->> models
                                   ;; as an optimization when listing collection items (GET /api/collection/items),
                                   ;; we might already know that the table is not an upload if is_upload=false. We
                                   ;; can skip making more queries if so
                                   (remove #(false? (:is_upload %)))
                                   (keep :table_id)
                                   set)
        has-uploadable-table? (comp (uploadable-table-ids table-ids) :table_id)]
    (for [model models]
      ;; NOTE: It is important that this logic is kept in sync with `invalidate-cached-models!`
      ;; If not, it will mean that the user could modify the table via a given model's page without seeing it update.
      (m/assoc-some model :based_on_upload (when (has-uploadable-table? model)
                                             (only-table-id model))))))

(mi/define-batched-hydration-method based-on-upload
  :based_on_upload
  "Add based_on_upload=<table-id> to a card if:
    - the card is a model
    - the query is a GUI query, and does not have any joins
    - the base table of the card is based on an upload
    - the user has permissions to upload to the table
    - uploads are enabled for at least one database (users can append/replace an upload table as long as uploads are
      enabled for a database, even if the table is not in a database for which uploads are enabled.)
  Otherwise based_on_upload is nil.
  Excluding checking the users write permissions for the card, `:based_on_upload` reflects the user's
  ability to upload to the underlying table through the card."
  [cards]
  (let [id->model         (m/index-by :id (model-hydrate-based-on-upload (filter #(= (:type %) :model) cards)))
        card->maybe-model (comp id->model :id)]
    (map #(or (card->maybe-model %) %) cards)))
