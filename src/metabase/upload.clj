(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data :as data]
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sync :as driver.s]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.mbql.util :as mbql.u]
   [metabase.models :refer [Database]]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.persisted-info :as persisted-info]
   [metabase.models.table :as table]
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

;; Upload types form a DAG (directed acyclic graph) where each type can be coerced into any
;; of its ancestors types. We parse each value in the CSV file to the most-specific possible
;; type for each column. The most-specific possible type for a column is the lowest common
;; ancestor of the types for each value in the column.
;;
;;              text
;;               |
;;               |
;;          varchar-255┐
;;        /     / \    │
;;       /     /   \   └──────────┬
;;      /     /     \             │
;;  boolean float   datetime  offset-datetime
;;     |     │       │
;;     │     │       │
;;     |    int     date
;;     |   /   \
;;     |  /     \
;;     | /       \
;;     |/         \
;; boolean-or-int  auto-incrementing-int-pk
;;
;; `boolean-or-int` is a special type with two parents, where we parse it as a boolean if the whole
;; column's values are of that type. additionally a column cannot have a boolean-or-int type, but
;; a value can. if there is a column with a boolean-or-int value and an integer value, the column will be int
;; if there is a column with a boolean-or-int value and a boolean value, the column will be boolean
;; if there is a column with only boolean-or-int values, the column will be parsed as if it were boolean
;;
;; </code></pre>

(def ^:private type+parent-pairs
  ;; listed in depth-first order
  '([::boolean-or-int ::boolean]
    [::boolean-or-int ::int]
    [::auto-incrementing-int-pk ::int]
    [::int ::float]
    [::date ::datetime]
    [::boolean ::varchar-255]
    [::offset-datetime ::varchar-255]
    [::datetime ::varchar-255]
    [::float ::varchar-255]
    [::varchar-255 ::text]))

(defn ^:private column-type
  "Returns the type of a column given the lowest common ancestor type of the values in the column."
  [type]
  (case type
    ::boolean-or-int ::boolean
    type))

(def ^:private type->parents
  (reduce
   (fn [m [type parent]]
     (update m type conj parent))
   {}
   type+parent-pairs))

(def ^:private value-types
  "All value types including the root type, ::text"
  (conj (keys type->parents) ::text))

(def ^:private column-types
  "All column types"
  (map column-type value-types))

(defn- bfs-ancestors [type]
  (loop [visit   (list type)
         visited (ordered-set/ordered-set)]
    (if (empty? visit)
      visited
      (let [parents (mapcat type->parents visit)]
        (recur parents (into visited parents))))))

(def ^:private type->bfs-ancestors
  "A map from each type to an ordered set of its ancestors, in breadth-first order"
  (into {} (for [type value-types]
             [type (bfs-ancestors type)])))

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
  (does-not-throw? (upload-parsing/parse-local-date s)))

(defn- datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-local-datetime s)))

(defn- offset-datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-offset-datetime s)))

(defn- boolean-string? [s]
  (boolean (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" s)))

(defn- boolean-or-int-string? [s]
  (boolean (#{"0" "1"} s)))

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
      (boolean-or-int-string? trimmed)                          ::boolean-or-int
      (boolean-string? trimmed)                                 ::boolean
      (offset-datetime-string? trimmed)                         ::offset-datetime
      (datetime-string? trimmed)                                ::datetime
      (date-string? trimmed)                                    ::date
      (re-matches (int-regex number-separators) trimmed)        ::int
      (re-matches (float-regex number-separators) trimmed)      ::float
      (<= (count trimmed) 255)                                  ::varchar-255
      :else                                                     ::text)))

(defn- row->value-types
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
    (contains? (type->bfs-ancestors type-a) type-b) type-b
    (contains? (type->bfs-ancestors type-b) type-a) type-a
    :else (lowest-common-member (type->bfs-ancestors type-a) (type->bfs-ancestors type-b))))

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

(def auto-pk-column-keyword
  "The keyword of the auto-incrementing PK column."
  (keyword auto-pk-column-name))

(defn- table-id->auto-pk-column [table-id]
  (first (filter (fn [field]
                   (= (normalize-column-name (:name field)) auto-pk-column-name))
                 (t2/select :model/Field :table_id table-id :active true))))

(mu/defn column-types-from-rows :- [:sequential (into [:enum] column-types)]
  "Returns a sequence of types, given the unparsed rows in the CSV file"
  [settings column-count rows]
  (->> rows
       (map #(row->value-types % settings))
       (reduce coalesce-types (repeat column-count nil))
       (map (fn [type]
              ;; if there's no values in the column, assume it's a string
              (if (nil? type)
                ::text
                (column-type type))))))

(defn- detect-schema
  "Consumes the header and rows from a CSV file.

   Returns an ordered map of normalized-column-name -> type for the given CSV file. Supported types include `::int`,
   `::datetime`, etc. A column that is completely blank is assumed to be of type `::text`."
  [header rows]
  (let [normalized-header (->> header
                               (map normalize-column-name))
        unique-header     (->> normalized-header
                               mbql.u/uniquify-names
                               (map keyword))
        column-count      (count normalized-header)
        settings          (upload-parsing/get-settings)
        col-name+type-pairs (->> rows
                                 (column-types-from-rows settings column-count)
                                 (map vector unique-header))]
    (ordered-map/ordered-map col-name+type-pairs)))


;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

(def ^:private last-timestamp (atom (t/local-date-time)))

(set! *warn-on-reflection* true)

(defn strictly-monotonic-now
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
        max-length                  (- (driver/table-name-length-limit driver) (count time-format))
        acceptable-length           (min (count slugified-name) max-length)
        truncated-name-without-time (subs slugified-name 0 acceptable-length)]
    (str truncated-name-without-time
         (t/format time-format (strictly-monotonic-now)))))

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

(defn- defaulting-database-type [driver upload-type]
  (or (driver/upload-type->database-type driver upload-type)
      (driver/upload-type->database-type driver ::varchar-255)))

(defn- column-definitions
  "Returns a map of column-name -> column-definition from a map of column-name -> upload-type."
  [driver col->upload-type]
  (update-vals col->upload-type (partial defaulting-database-type driver)))

(defn current-database
  "The database being used for uploads (as per the `uploads-database-id` setting)."
  []
  (t2/select-one Database :id (public-settings/uploads-database-id)))

(mu/defn ^:private table-identifier
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
  Replaces empty strings with nil."
  [col-upload-types rows]
  (let [settings (upload-parsing/get-settings)
        parsers  (map #(upload-parsing/upload-type->parser % settings) col-upload-types)]
    (for [row rows]
      (for [[value parser] (map-with-nils vector row parsers)]
        (when-not (str/blank? value)
          (parser value))))))

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
  (set (indices-where #(= auto-pk-column-name (normalize-column-name %)) header)))

(defn- without-auto-pk-columns
  [header-and-rows]
  (let [header (first header-and-rows)
        auto-pk-indices (auto-pk-column-indices header)]
    (cond->> header-and-rows
      auto-pk-indices
      (map (partial remove-indices auto-pk-indices)))))

(defn- columns-with-auto-pk [columns]
  (merge (ordered-map/ordered-map auto-pk-column-keyword ::auto-incrementing-int-pk) columns))

(defn- create-auto-pk-column? [driver db]
  (driver.u/supports? driver :upload-with-auto-pk db))

(defn- load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db table-name ^File csv-file]
  (with-open [reader (bom/bom-reader csv-file)]
    (let [auto-pk?                (create-auto-pk-column? driver db)
          [header & rows]         (cond-> (csv/read-csv reader)
                                    auto-pk?
                                    without-auto-pk-columns)
          cols->upload-type       (detect-schema header (sample-rows rows))
          col-definitions         (column-definitions driver (cond-> cols->upload-type
                                                               auto-pk?
                                                               columns-with-auto-pk))
          csv-col-names           (keys cols->upload-type)
          col-upload-types        (vals cols->upload-type)
          parsed-rows             (vec (parse-rows col-upload-types rows))]
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
         :size-mb           (/ (.length csv-file)
                               1048576.0)}
        (catch Throwable e
          (driver/drop-table! driver (:id db) table-name)
          (throw (ex-info (ex-message e) {:status-code 400})))))))

;;;; +------------------+
;;;; |  Create upload
;;;; +------------------+

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

(defn- can-use-uploads-error
  "Returns an ExceptionInfo object if the user cannot upload to the given database for the subset of reasons common to all uploads
  entry points. Returns nil otherwise."
  [db]
  (let [driver (driver.u/database->driver db)]
    (cond
      (not (public-settings/uploads-enabled))
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
  (or (can-use-uploads-error db)
      (cond
        (and (str/blank? schema-name)
             (driver.u/supports? (driver.u/database->driver db) :schemas db))
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
    (collection/check-write-perms-for-collection collection-id)
    (try
      (let [start-time        (System/currentTimeMillis)
            driver            (driver.u/database->driver database)
            filename-prefix   (or (second (re-matches #"(.*)\.csv$" filename))
                                  filename)
            table-name        (->> (str table-prefix filename-prefix)
                                   (unique-table-name driver)
                                   (u/lower-case-en))
            schema+table-name (table-identifier {:schema schema-name :name table-name})
            stats             (load-from-csv! driver database schema+table-name file)
            ;; Sync immediately to create the Table and its Fields; the scan is settings-dependent and can be async
            table             (sync-tables/create-or-reactivate-table! database {:name table-name :schema (not-empty schema-name)})
            _set-is-upload    (t2/update! :model/Table (:id table) {:is_upload true})
            _sync             (scan-and-sync-table! database table)
            ;; Set the display_name of the auto-generated primary key column to the same as its name, so that if users
            ;; download results from the table as a CSV and reupload, we'll recognize it as the same column
            _                 (when (create-auto-pk-column? driver database)
                                (let [auto-pk-field (table-id->auto-pk-column (:id table))]
                                  (t2/update! :model/Field (:id auto-pk-field) {:display_name (:name auto-pk-field)})))
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

;;; +-----------------------------
;;; |  appending to uploaded table
;;; +-----------------------------

(defn- base-type->upload-type
  "Returns the most specific upload type for the given base type."
  [base-type]
  (condp #(isa? %2 %1) base-type
    :type/Float                  ::float
    :type/BigInteger             ::int
    :type/Integer                ::int
    :type/Boolean                ::boolean
    :type/DateTimeWithTZ         ::offset-datetime
    :type/DateTime               ::datetime
    :type/Date                   ::date
    :type/Text                   ::text))

(defn- not-blank [s]
  (when-not (str/blank? s)
    s))

(defn- extra-and-missing-error-markdown [extra missing]
  (->> [[(tru "The CSV file contains extra columns that are not in the table:") extra]
        [(tru "The CSV file is missing columns that are in the table:") missing]]
       (keep (fn [[header columns]]
               (when (seq columns)
                 (str/join "\n" (cons header (map #(str "- " %) columns))))))
       (str/join "\n\n")
       (not-blank)))

(defn- check-schema
  "Throws an exception if:
    - the CSV file contains duplicate column names
    - the schema of the CSV file does not match the schema of the table

    Note that we do not require the column ordering to be consistent between the header and the table schema."
  [fields-by-normed-name header]
  ;; Assumes table-cols are unique when normalized
  (let [normalized-field-names (keys fields-by-normed-name)
        normalized-header      (map normalize-column-name header)
        [extra missing _both] (data/diff (set normalized-header) (set normalized-field-names))]
    ;; check for duplicates
    (when (some #(< 1 %) (vals (frequencies normalized-header)))
      (throw (ex-info (tru "The CSV file contains duplicate column names.")
                      {:status-code 422})))
    (when (or extra missing)
      (let [error-message (extra-and-missing-error-markdown extra missing)]
        (throw (ex-info error-message {:status-code 422}))))))

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
                                       :type     "model"
                                       :archived false)
                            (filter (comp #{(:id table)} only-table-id))
                            (map :id)
                            seq)]
    ;; Ideally we would do all the filtering in the query, but this would not allow us to leverage mlv2.
    (persisted-info/invalidate! {:card_id [:in model-ids]})))

(defn- append-csv!*
  [database table file]
  (with-open [reader (bom/bom-reader file)]
    (let [driver             (driver.u/database->driver database)
          auto-pk?           (create-auto-pk-column? driver database)
          [header & rows]    (cond-> (csv/read-csv reader)
                               auto-pk?
                               without-auto-pk-columns)
          normed-name->field (m/index-by (comp normalize-column-name :name)
                                         (t2/select :model/Field :table_id (:id table) :active true))
          normed-header      (map normalize-column-name header)
          create-auto-pk?    (and
                              auto-pk?
                              (driver/create-auto-pk-with-append-csv? driver)
                              (not (contains? normed-name->field auto-pk-column-name)))
          normed-name->field (cond-> normed-name->field auto-pk? (dissoc auto-pk-column-name))
          _                  (check-schema normed-name->field header)
          col-upload-types   (map (comp base-type->upload-type :base_type normed-name->field) normed-header)
          parsed-rows        (parse-rows col-upload-types rows)]
      (try
        (driver/insert-into! driver (:id database) (table-identifier table) normed-header parsed-rows)
        (catch Throwable e
          (throw (ex-info (ex-message e) {:status-code 422}))))
      (when create-auto-pk?
        (driver/add-columns! driver
                             (:id database)
                             (table-identifier table)
                             {auto-pk-column-keyword (conj (driver/upload-type->database-type driver ::auto-incrementing-int-pk))}
                             :primary-key [auto-pk-column-keyword]))
      (scan-and-sync-table! database table)
      (when create-auto-pk?
        (let [auto-pk-field (table-id->auto-pk-column (:id table))]
          (t2/update! :model/Field (:id auto-pk-field) {:display_name (:name auto-pk-field)})))
      (invalidate-cached-models! table)
      {:row-count (count parsed-rows)})))

(defn- can-append-error
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

(defn- check-can-append
  "Throws an error if the user cannot upload to the given database and schema."
  [db table]
  (when-let [error (can-append-error db table)]
    (throw error)))

(defn can-upload-to-table?
  "Returns true if the user can upload to the given database and table, and false otherwise."
  [db table]
  (nil? (can-append-error db table)))

;;; +--------------------------------------------------
;;; |  public interface for appending to uploaded table
;;; +--------------------------------------------------

(mu/defn append-csv!
  "Main entry point for appending to uploaded tables with a CSV file.
  This will create an auto-incrementing primary key (auto-pk) column in the table for drivers that supported uploads
  before auto-pk columns were introduced by metabase#36249."
  [{:keys [^File file table-id]}
   :- [:map
       [:table-id ms/PositiveInt]
       [:file (ms/InstanceOfClass File)]]]
  (let [table    (api/check-404 (t2/select-one :model/Table :id table-id))
        database (table/database table)]
    (check-can-append database table)
    (append-csv!* database table file)))

;;; +--------------------------------
;;; |  hydrate based_on_upload for FE
;;; +--------------------------------

(defn uploadable-table-ids
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
                           [:is_upload {:optional true} [:maybe :boolean]]]]]
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
    - uploads are enabled
  Otherwise based_on_upload is nil."
  [cards]
  (let [id->model         (m/index-by :id (model-hydrate-based-on-upload (filter :dataset cards)))
        card->maybe-model (comp id->model :id)]
    (map #(or (card->maybe-model %) %) cards)))
