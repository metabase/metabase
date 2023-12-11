(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [java-time.api :as t]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.mbql.util :as mbql.u]
   [metabase.models :refer [Database]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.humanization :as humanization]
   [metabase.models.permissions :as perms]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata.fields :as sync-fields]
   [metabase.sync.sync-metadata.tables :as sync-tables]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;;; <pre><code>
;;;;
;;;; +------------------+
;;;; | Schema detection |
;;;; +------------------+

;;              text
;;               |
;;               |
;;          varchar-255┐
;;              / \    │
;;             /   \   └──────────┬
;;            /     \             │
;;         float   datetime  offset-datetime
;;           │       │
;;           │       │
;;          int     date
;;         /   \
;;        /     \
;;    boolean auto-incrementing-int-pk
;;
;; </code></pre>

(def ^:private type->parent
  ;; listed in depth-first order
  {::text                     nil
   ::varchar-255              ::text
   ::float                    ::varchar-255
   ::int                      ::float
   ::auto-incrementing-int-pk ::int
   ::boolean                  ::int
   ::datetime                 ::varchar-255
   ::date                     ::datetime
   ::offset-datetime          ::varchar-255})

(def ^:private types
  (keys type->parent))

(def ^:private type->ancestors
  (into {} (for [type types]
             [type (loop [ret (ordered-set/ordered-set)
                          type type]
                     (if-some [parent (type->parent type)]
                       (recur (conj ret parent) parent)
                       ret))])))

;;;;;;;;;;;;;;;;;;;;;;;;;;
;; [[value->type]] helpers

(defn- with-parens
  "Returns a regex that matches the argument, with or without surrounding parentheses."
  [number-regex]
  (re-pattern (str "(" number-regex ")|(\\(" number-regex "\\))")))

(defn- with-currency
  "Returns a regex that matches a positive or negative number, including currency symbols"
  [number-regex]
  ;; currency signs can be all over: $2, -$2, $-2, 2€
  (re-pattern (str upload-parsing/currency-regex "?\\s*-?"
                   upload-parsing/currency-regex "?"
                   number-regex
                   "\\s*" upload-parsing/currency-regex "?")))

(defn- int-regex [number-separators]
  (with-parens
    (with-currency
      (case number-separators
        ("." ".,") #"\d[\d,]*"
        ",." #"\d[\d.]*"
        ", " #"\d[\d \u00A0]*"
        ".’" #"\d[\d’]*"))))

(defn- float-regex [number-separators]
  (with-parens
    (with-currency
      (case number-separators
        ("." ".,") #"\d[\d,]*\.\d+"
        ",." #"\d[\d.]*\,[\d]+"
        ", " #"\d[\d \u00A0]*\,[\d.]+"
        ".’" #"\d[\d’]*\.[\d.]+"))))

(defmacro does-not-throw?
  "Returns true if the given body does not throw an exception."
  [body]
  `(try
     ~body
     true
     (catch Throwable e#
       false)))

(defn- date-string? [s]
  (does-not-throw? (t/local-date s)))

(defn- datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-datetime s)))

(defn- offset-datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-offset-datetime s)))

(defn- boolean-string? [s]
  (boolean (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" s)))

;; end [[value->type]] helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- value->type
  "The most-specific possible type for a given value. Possibilities are:

    - `::boolean`
    - `::int`
    - `::float`
    - `::varchar-255`
    - `::date`
    - `::datetime`
    - `::offset-datetime`
    - `::text` (the catch-all type)

  NB: There are currently the following gotchas:
    1. ints/floats are assumed to use the separators and decimal points corresponding to the locale defined in the
       application settings
    2. 0 and 1 are assumed to be booleans, not ints."
  [value {:keys [number-separators] :as _settings}]
  (let [trimmed (str/trim value)]
    (cond
      (str/blank? value)                                        nil
      (boolean-string? trimmed)                                 ::boolean
      (offset-datetime-string? trimmed)                         ::offset-datetime
      (datetime-string? trimmed)                                ::datetime
      (date-string? trimmed)                                    ::date
      (re-matches (int-regex number-separators) trimmed)        ::int
      (re-matches (float-regex number-separators) trimmed)      ::float
      (<= (count trimmed) 255)                                  ::varchar-255
      :else                                                     ::text)))

(defn- row->types
  [row settings]
  (map #(value->type % settings) row))

(defn- lowest-common-member [[x & xs :as all-xs] ys]
  (cond
    (empty? all-xs)  (throw (IllegalArgumentException. (tru "Could not find a common type for {0} and {1}" all-xs ys)))
    (contains? ys x) x
    :else            (recur xs ys)))

(defn- lowest-common-ancestor [type-a type-b]
  (cond
    (nil? type-a) type-b
    (nil? type-b) type-a
    (= type-a type-b) type-a
    (contains? (type->ancestors type-a) type-b) type-b
    (contains? (type->ancestors type-b) type-a) type-a
    :else (lowest-common-member (type->ancestors type-a) (type->ancestors type-b))))

(defn- map-with-nils
  "like map with two args except it continues to apply f until ALL of the colls are
  exhausted. if colls are of uneven length, nils are supplied."
  [f c1 c2]
  (lazy-seq
   (let [s1 (seq c1) s2 (seq c2)]
     (when (or s1 s2)
       (cons (f (first s1) (first s2))
             (map-with-nils f (rest s1) (rest s2)))))))

(defn- coalesce-types
  "compares types-a and types-b pairwise, finding the lowest-common-ancestor for each pair.
  types-a and types-b can be different lengths."
  [types-a types-b]
  (map-with-nils lowest-common-ancestor types-a types-b))

(defn- normalize-column-name
  [raw-name]
  (if (str/blank? raw-name)
    "unnamed_column"
    (u/slugify (str/trim raw-name))))

(def auto-pk-column-name
  "The lower-case name of the auto-incrementing PK column. The actual name in the database could be in upper-case."
  "_mb_row_id")

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

(defn- parse-rows*
  "Returns a lazy seq of parsed rows, given a sequence of upload types for each column.
  Replaces empty strings with nil."
  [col-upload-types rows]
  (let [settings (upload-parsing/get-settings)
        parsers  (map #(upload-parsing/upload-type->parser % settings) col-upload-types)]
    (for [row rows]
      (for [[value parser] (map-with-nils vector row parsers)]
        (when (not (str/blank? value))
          (parser value))))))

(defn- rows->schema
  "Rows should be a lazy-seq. This function hides the logic for ignoring any columns in the CSV that have the same
  normalized name as the auto-pk-column-name."
  [header rows]
  (let [normalized-header (->> header
                               (map normalize-column-name))
        ;; remove columns from the rows with the same normalized name as the auto-pk-column-name
        auto-pk-col-indices (set (indices-where #(= auto-pk-column-name %) normalized-header))
        ;; this function removes the auto-pk columns from each row for parsing and type detection
        remove-auto-pk-cols (fn [row]
                              (remove-indices auto-pk-col-indices row))
        rows              (cond->> rows
                            (seq auto-pk-col-indices)
                            (map remove-auto-pk-cols))
        unique-header     (->> normalized-header
                               remove-auto-pk-cols
                               mbql.u/uniquify-names
                               (map keyword))
        column-count      (count normalized-header)
        settings          (upload-parsing/get-settings)
        col-name+type-pairs (->> rows
                                 (map #(row->types % settings))
                                 (reduce coalesce-types (repeat column-count nil))
                                 (map #(or % ::text))
                                 (map vector unique-header))]
    {:extant-columns    (ordered-map/ordered-map col-name+type-pairs)
     :generated-columns (ordered-map/ordered-map (keyword auto-pk-column-name) ::auto-incrementing-int-pk)
     :parse-rows        (fn [rows']
                          (let [rows' (cond->> rows'
                                       (seq auto-pk-col-indices)
                                       (map remove-auto-pk-cols))
                                col-types (map second col-name+type-pairs)]
                            (parse-rows* col-types rows')))}))


;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

(defn- unique-table-name
  "Append the current datetime to the given name to create a unique table name. The resulting name will be short enough for the given driver (truncating the supplised `table-name` if necessary)."
  [driver table-name]
  (let [time-format                 "_yyyyMMddHHmmss"
        acceptable-length           (min (count table-name)
                                         (- (driver/table-name-length-limit driver) (count time-format)))
        truncated-name-without-time (subs (u/slugify table-name) 0 acceptable-length)]
    (str truncated-name-without-time
         (t/format time-format (t/local-date-time)))))

(def ^:private max-sample-rows "Maximum number of values to use for detecting a column's type" 1000)

(defn- sample-rows
  "Returns an improper subset of the rows no longer than [[max-sample-rows]]. Takes an evenly-distributed sample (not
  just the first n)."
  [rows]
  (take max-sample-rows
        (take-nth (max 1
                       (long (/ (count rows)
                                max-sample-rows)))
                  rows)))

(defn- upload-type->col-specs
  [driver col->upload-type]
  (update-vals col->upload-type (partial driver/upload-type->database-type driver)))

(defn- detect-schema
  "Consumes a CSV file that *must* have headers as the first row.

  Returns a map with three keys:
    - `:extant-columns`: an ordered map of columns found in the CSV file, excluding columns that have the same normalized name as the generated columns.
    - `:generated-columns`: an ordered map of columns we are generating ourselves. Currently, this is just the auto-incrementing PK.
    - `:parse-rows`: a function that takes a single lazy-seq of rows, and returns a lazy-seq of rows. It parses the
          string values in each row and removes columns that have the same normalized name as the generated columns.

  The value of `extant-columns` and `generated-columns` is an ordered map of normalized-column-name -> type for the
  given CSV file. Supported types include `::int`, `::datetime`, etc. A column that is completely blank is assumed to
  be of type ::text."
  [csv-file]
  (with-open [reader (bom/bom-reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema header (sample-rows rows)))))

(defn current-database
  "The database being used for uploads (as per the `uploads-database-id` setting)."
  []
  (t2/select-one Database :id (public-settings/uploads-database-id)))

(defn- load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db-id table-name ^File csv-file]
  (let [{:keys [extant-columns generated-columns parse-rows]} (detect-schema csv-file)
        cols->upload-type       (merge generated-columns extant-columns)
        col-to-create->col-spec (upload-type->col-specs driver cols->upload-type)
        csv-col-names           (keys extant-columns)]
    (driver/create-table! driver db-id table-name col-to-create->col-spec)
    (try
      (with-open [reader (io/reader csv-file)]
        (let [rows (->> (csv/read-csv reader)
                        (drop 1) ; drop header
                        parse-rows)]
          (driver/insert-into! driver db-id table-name csv-col-names rows)
          {:num-rows          (count rows)
           :num-columns       (count extant-columns)
           :generated-columns (count generated-columns)
           :size-mb           (/ (.length csv-file)
                                 1048576.0)}))
      (catch Throwable e
        (driver/drop-table! driver db-id table-name)
        (throw (ex-info (ex-message e) {:status-code 400}))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 public interface                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:dynamic *sync-synchronously?*
  "For testing purposes, often we'd like to sync synchronously so that we can test the results immediately and avoid
  race conditions."
  false)

(defn- scan-and-sync-table!
  [database table]
  (sync-fields/sync-fields-for-table! database table)
  (if *sync-synchronously?*
    (sync/sync-table! table)
    (future
      (sync/sync-table! table))))

(defn- can-upload-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database and schema. Returns nil otherwise."
  [db schema-name]
  (let [driver (driver.u/database->driver db)]
    (cond
      (not (public-settings/uploads-enabled))
      (ex-info (tru "Uploads are not enabled.")
               {:status-code 422})
      (premium-features/sandboxed-user?)
      (ex-info (tru "Uploads are not permitted for sandboxed users.")
               {:status-code 403})
      (not (driver/database-supports? driver :uploads nil))
      (ex-info (tru "Uploads are not supported on {0} databases." (str/capitalize (name driver)))
               {:status-code 422})
      (and (str/blank? schema-name)
           (driver/database-supports? driver :schemas db))
      (ex-info (tru "A schema has not been set.")
               {:status-code 422})
      (not (perms/set-has-full-permissions? @api/*current-user-permissions-set*
                                            (perms/data-perms-path (u/the-id db) schema-name)))
      (ex-info (tru "You don''t have permissions to do that.")
               {:status-code 403})
      (and (some? schema-name)
           (not (driver.s/include-schema? db schema-name)))
      (ex-info (tru "The schema {0} is not syncable." schema-name)
               {:status-code 422}))))

(defn- check-can-upload
  "Throws an error if the user cannot upload to the given database and schema."
  [db schema-name]
  (when-let [error (can-upload-error db schema-name)]
    (throw error)))

(defn can-upload?
  "Returns true if the user can upload to the given database and schema, and false otherwise."
  [db schema-name]
  (nil? (can-upload-error db schema-name)))

(mu/defn upload-csv!
  "Main entry point for CSV uploading.

  What it does:
  - throws an error if the user cannot upload to the given database and schema (see [[can-upload-error]] for reasons)
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
    (check-can-upload database schema-name)
    (collection/check-write-perms-for-collection collection-id)
    (try
      (let [start-time        (System/currentTimeMillis)
            driver            (driver.u/database->driver database)
            filename-prefix   (or (second (re-matches #"(.*)\.csv$" filename))
                                  filename)
            table-name        (->> (str table-prefix filename-prefix)
                                   (unique-table-name driver)
                                   (u/lower-case-en))
            schema+table-name (if (str/blank? schema-name)
                                table-name
                                (str schema-name "." table-name))
            stats             (load-from-csv! driver (:id database) schema+table-name file)
          ;; Sync immediately to create the Table and its Fields; the scan is settings-dependent and can be async
            table             (sync-tables/create-or-reactivate-table! database {:name table-name :schema (not-empty schema-name)})
            _set_is_upload    (t2/update! :model/Table (:id table) {:is_upload true})
            _sync             (scan-and-sync-table! database table)
          ;; Set the display_name of the auto-generated primary key column to the same as its name, so that if users
          ;; download results from the table as a CSV and reupload, we'll recognize it as the same column
            auto-pk-field     (t2/select-one :model/Field :table_id (:id table)
                                             :%lower.name auto-pk-column-name)
            _                 (t2/update! :model/Field (:id auto-pk-field) {:display_name (:name auto-pk-field)})
            card              (card/create-card!
                               {:collection_id          collection-id
                                :dataset                true
                                :database_id            (:id database)
                                :dataset_query          {:database (:id database)
                                                         :query    {:source-table (:id table)}
                                                         :type     :query}
                                :display                :table
                                :name                   (humanization/name->human-readable-name filename-prefix)
                                :visualization_settings {}}
                               @api/*current-user*)
            upload-seconds    (/ (- (System/currentTimeMillis) start-time)
                                 1000.0)]
        (snowplow/track-event! ::snowplow/csv-upload-successful
                               api/*current-user-id*
                               (merge
                                {:model-id       (:id card)
                                 :upload-seconds upload-seconds}
                                stats))
        card)
      (catch Throwable e
        (let [fail-stats (with-open [reader (bom/bom-reader file)]
                           (let [rows (csv/read-csv reader)]
                             {:size-mb     (/ (.length file) 1048576.0)
                              :num-columns (count (first rows))
                              :num-rows    (count (rest rows))}))]
          (snowplow/track-event! ::snowplow/csv-upload-failed api/*current-user-id* fail-stats))
        (throw e)))))
