(ns metabase.driver.sql-jdbc.sync.describe-table
  "SQL JDBC impl for `describe-fields`, `describe-table`, `describe-fks`, `describe-table-fks`, and `describe-nested-field-columns`.
  `describe-table-fks` is deprecated and will be replaced by `describe-fks` in the future."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.common :as sql-jdbc.sync.common]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.models :refer [Field]]
   [metabase.models.setting :as setting]
   [metabase.models.table :as table]
   [metabase.sync.util :as sync-util]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonFactory JsonParser JsonToken JsonParser$NumberType)
   (java.sql Connection DatabaseMetaData ResultSet)))

(set! *warn-on-reflection* true)

(defmethod sql-jdbc.sync.interface/column->semantic-type :sql-jdbc
  [_driver _database-type _column-name]
  nil)

(defn pattern-based-database-type->base-type
  "Return a `database-type->base-type` function that matches types based on a sequence of pattern / base-type pairs.
  `pattern->type` is a map of regex pattern to MBQL type keyword."
  [pattern->type]
  (fn database-type->base-type [column-type]
    (let [column-type (name column-type)]
      (some
       (fn [[pattern base-type]]
         (when (re-find pattern column-type)
           base-type))
       pattern->type))))

(defn get-catalogs
  "Returns a set of all of the catalogs found via `metadata`"
  [^DatabaseMetaData metadata]
  (with-open [rs (.getCatalogs metadata)]
    (set (map :table_cat (jdbc/metadata-result rs)))))

(defn- database-type->base-type-or-warn
  "Given a `database-type` (e.g. `VARCHAR`) return the mapped Metabase type (e.g. `:type/Text`)."
  [driver database-type]
  (or (sql-jdbc.sync.interface/database-type->base-type driver (keyword database-type))
      (do (log/warnf "Don't know how to map column type '%s' to a Field base_type, falling back to :type/*."
                     database-type)
          :type/*)))

(defn- calculated-semantic-type
  "Get an appropriate semantic type for a column with `column-name` of type `database-type`."
  [driver ^String column-name ^String database-type]
  (when-let [semantic-type (sql-jdbc.sync.interface/column->semantic-type driver database-type column-name)]
    (assert (isa? semantic-type :type/*)
      (str "Invalid type: " semantic-type))
    semantic-type))

(defmethod sql-jdbc.sync.interface/fallback-metadata-query :sql-jdbc
  [driver db-name-or-nil schema-name table-name]
  {:pre [(string? table-name)]}
  ;; Using our SQL compiler here to get portable LIMIT (e.g. `SELECT TOP n ...` for SQL Server/Oracle)
  (let [table    (sql.qp/->honeysql driver (h2x/identifier :table db-name-or-nil schema-name table-name))
        honeysql {:select [:*]
                  :from   [[table]]
                  :where  [:not= (sql.qp/inline-num 1) (sql.qp/inline-num 1)]}
        honeysql (sql.qp/apply-top-level-clause driver :limit honeysql {:limit 0})]
    (sql.qp/format-honeysql driver honeysql)))

(defn- fallback-fields-metadata-from-select-query
  "In some rare cases `:column_name` is blank (eg. SQLite's views with group by) fallback to sniffing the type from a
  SELECT * query."
  [driver ^Connection conn db-name-or-nil schema table]
  ;; some DBs (:sqlite) don't actually return the correct metadata for LIMIT 0 queries
  (let [[sql & params] (sql-jdbc.sync.interface/fallback-metadata-query driver db-name-or-nil schema table)]
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (with-open [stmt (sql-jdbc.sync.common/prepare-statement driver conn sql params)
                    rs   (.executeQuery stmt)]
          (let [metadata (.getMetaData rs)]
            (reduce
             ((map (fn [^Integer i]
                     ;; TODO: missing :database-required column as ResultSetMetadata does not have information about
                     ;; the default value of a column, so we can't make sure whether a column is required or not
                     {:name                       (.getColumnName metadata i)
                      :database-type              (.getColumnTypeName metadata i)
                      :database-is-auto-increment (.isAutoIncrement metadata i)})) rf)
             init
             (range 1 (inc (.getColumnCount metadata))))))))))

(defn- jdbc-fields-metadata
  "Reducible metadata about the Fields belonging to a Table, fetching using JDBC DatabaseMetaData methods."
  [driver ^Connection conn db-name-or-nil schema table-name]
  (sql-jdbc.sync.common/reducible-results
    #(.getColumns (.getMetaData conn)
                  db-name-or-nil
                  (some->> schema (driver/escape-entity-name-for-metadata driver))
                  (some->> table-name (driver/escape-entity-name-for-metadata driver))
                  nil)
    (fn [^ResultSet rs]
      ;; https://docs.oracle.com/javase/7/docs/api/java/sql/DatabaseMetaData.html#getColumns(java.lang.String,%20java.lang.String,%20java.lang.String,%20java.lang.String)
      #(let [default            (.getString rs "COLUMN_DEF")
             no-default?        (contains? #{nil "NULL" "null"} default)
             nullable           (.getInt rs "NULLABLE")
             not-nullable?      (= 0 nullable)
             ;; IS_AUTOINCREMENT could return nil
             auto-increment     (.getString rs "IS_AUTOINCREMENT")
             auto-increment?    (= "YES" auto-increment)
             no-auto-increment? (= "NO" auto-increment)
             column-name        (.getString rs "COLUMN_NAME")
             required?          (and no-default? not-nullable? no-auto-increment?)]
         (merge
           {:name                       column-name
            :database-type              (.getString rs "TYPE_NAME")
            :database-is-auto-increment auto-increment?
            :database-required          required?}
           (when-let [remarks (.getString rs "REMARKS")]
             (when-not (str/blank? remarks)
               {:field-comment remarks})))))))

(defn ^:private fields-metadata
  [driver ^Connection conn {schema :schema, table-name :name} ^String db-name-or-nil]
  {:pre [(instance? Connection conn) (string? table-name)]}
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      ;; 1. Return all the Fields that come back from DatabaseMetaData that include type info.
      ;;
      ;; 2. Iff there are some Fields that don't have type info, concatenate
      ;;    `fallback-fields-metadata-from-select-query`, which fetches the same Fields using a different method.
      ;;
      ;; 3. Filter out any duplicates between the two methods using `m/distinct-by`.
      (let [has-fields-without-type-info? (volatile! false)
            ;; intented to fix syncing dynamic tables for snowflake.
            ;; currently there is a bug in snowflake jdbc (snowflake#1574) in which it doesn't return columns for dynamic tables
            jdbc-returns-no-field?        (volatile! true)
            jdbc-metadata                 (eduction
                                           (remove (fn [{:keys [database-type]}]
                                                     (when @jdbc-returns-no-field?
                                                       (vreset! jdbc-returns-no-field? false))
                                                     (when (str/blank? database-type)
                                                       (vreset! has-fields-without-type-info? true)
                                                       true)))
                                           (jdbc-fields-metadata driver conn db-name-or-nil schema table-name))
            fallback-metadata             (reify clojure.lang.IReduceInit
                                            (reduce [_ rf init]
                                              (reduce
                                               rf
                                               init
                                               (when (or @jdbc-returns-no-field? @has-fields-without-type-info?)
                                                 (fallback-fields-metadata-from-select-query driver conn db-name-or-nil schema table-name)))))]
        ;; VERY IMPORTANT! DO NOT REWRITE THIS TO BE LAZY! IT ONLY WORKS BECAUSE AS NORMAL-FIELDS GETS REDUCED,
        ;; HAS-FIELDS-WITHOUT-TYPE-INFO? WILL GET SET TO TRUE IF APPLICABLE AND THEN FALLBACK-FIELDS WILL RUN WHEN
        ;; IT'S TIME TO START EVALUATING THAT.
        (reduce
         ((comp cat (m/distinct-by :name)) rf)
         init
         [jdbc-metadata fallback-metadata])))))

(defn describe-fields-xf
  "Returns a transducer for computing metadata about the fields in `db`."
  [driver db]
  (map (fn [col]
         (let [base-type      (database-type->base-type-or-warn driver (:database-type col))
               semantic-type  (calculated-semantic-type driver (:name col) (:database-type col))
               json?          (isa? base-type :type/JSON)]
           (merge
            (u/select-non-nil-keys col [:table-schema
                                        :table-name
                                        :pk?
                                        :name
                                        :database-type
                                        :database-position
                                        :field-comment
                                        :database-required
                                        :database-is-auto-increment])
            {:base-type         base-type
             ;; json-unfolding is true by default for JSON fields, but this can be overridden at the DB level
             :json-unfolding    json?}
            (when semantic-type
              {:semantic-type semantic-type})
            (when (and json? (driver/database-supports? driver :nested-field-columns db))
              {:visibility-type :details-only}))))))

(defn describe-table-fields-xf
  "Returns a transducer for computing metadata about the fields in a table, given the database `db`."
  [driver db]
  (comp
   (describe-fields-xf driver db)
   (map-indexed (fn [i col] (assoc col :database-position i)))))

(defmulti describe-table-fields
  "Returns a set of column metadata for `table` using JDBC Connection `conn`."
  {:added    "0.45.0"
   :arglists '([driver ^Connection conn table ^String db-name-or-nil])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod describe-table-fields :sql-jdbc
  [driver conn table db-name-or-nil]
  (into
   #{}
   (describe-table-fields-xf driver (table/database table))
   (fields-metadata driver conn table db-name-or-nil)))

(defmulti get-table-pks
  "Returns a vector of primary keys for `table` using a JDBC DatabaseMetaData from JDBC Connection `conn`.
  The PKs should be ordered by column names if there are multiple PKs.
  Ref: https://docs.oracle.com/javase/8/docs/api/java/sql/DatabaseMetaData.html#getPrimaryKeys-java.lang.String-java.lang.String-java.lang.String-

  Note: If db-name, schema, and table-name are not passed, this may return _all_ pks that the metadata's connection can access.

  This does not need to be implemented for drivers that support the [[driver/describe-fields]] multimethod."
  {:changelog-test/ignore true
   :added    "0.45.0"
   :arglists '([driver ^Connection conn db-name-or-nil table])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod get-table-pks :default
  [_driver ^Connection conn db-name-or-nil table]
  (let [^DatabaseMetaData metadata (.getMetaData conn)]
    (into [] (sql-jdbc.sync.common/reducible-results
              #(.getPrimaryKeys metadata db-name-or-nil (:schema table) (:name table))
              (fn [^ResultSet rs] #(.getString rs "COLUMN_NAME"))))))

(defn add-table-pks
  "Using `conn`, find any primary keys for `table` (or more, see: [[get-table-pks]]) and finally assoc `:pk?` to true for those columns."
  [driver ^Connection conn db-name-or-nil table]
  (let [pks (set (get-table-pks driver conn db-name-or-nil table))]
    (update table :fields (fn [fields]
                            (set (for [field fields]
                                   (if-not (contains? pks (:name field))
                                     field
                                     (assoc field :pk? true))))))))

(defn- describe-table*
  ([driver ^Connection conn table]
   (describe-table* driver conn nil table))
  ([driver ^Connection conn db-name-or-nil table]
   {:pre [(instance? Connection conn)]}
   (->> (assoc (select-keys table [:name :schema])
               :fields (describe-table-fields driver conn table nil))
        ;; find PKs and mark them
        (add-table-pks driver conn db-name-or-nil))))

(defn describe-table
  "Default implementation of `driver/describe-table` for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db table]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db
   nil
   (fn [^Connection conn]
     (describe-table* driver conn table))))

(defmulti describe-fields-sql
  "Returns a SQL query ([sql & params]) for use in the default JDBC implementation of [[metabase.driver/describe-fields]],
 i.e. [[describe-fields]]."
  {:added    "0.49.1"
   :arglists '([driver & {:keys [schema-names table-names]}])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn describe-fields
  "Default implementation of [[metabase.driver/describe-fields]] for JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db & {:keys [schema-names table-names] :as args}]
  (if (or (and schema-names (empty? schema-names))
          (and table-names (empty? table-names)))
    []
    (eduction
     (describe-fields-xf driver db)
     (sql-jdbc.execute/reducible-query db (describe-fields-sql driver args)))))

(defn- describe-table-fks*
  [_driver ^Connection conn {^String schema :schema, ^String table-name :name} & [^String db-name-or-nil]]
  (into
   #{}
   (sql-jdbc.sync.common/reducible-results #(.getImportedKeys (.getMetaData conn) db-name-or-nil schema table-name)
                                           (fn [^ResultSet rs]
                                             (fn []
                                               {:fk-column-name   (.getString rs "FKCOLUMN_NAME")
                                                :dest-table       {:name   (.getString rs "PKTABLE_NAME")
                                                                   :schema (.getString rs "PKTABLE_SCHEM")}
                                                :dest-column-name (.getString rs "PKCOLUMN_NAME")})))))

(defn describe-table-fks
  "Default implementation of [[metabase.driver/describe-table-fks]] for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db-or-id-or-spec table & [db-name-or-nil]]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db-or-id-or-spec
   nil
   (fn [^Connection conn]
     (describe-table-fks* driver conn table db-name-or-nil))))

(defmulti describe-fks-sql
 "Returns a SQL query ([sql & params]) for use in the default JDBC implementation of [[metabase.driver/describe-fks]],
 i.e. [[describe-fks]]."
 {:added    "0.49.0"
  :arglists '([driver & {:keys [schema-names table-names]}])}
 driver/dispatch-on-initialized-driver
 :hierarchy #'driver/hierarchy)

(defn describe-fks
  "Default implementation of [[metabase.driver/describe-fks]] for JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db & {:keys [schema-names table-names] :as args}]
  (if (or (and schema-names (empty? schema-names))
          (and table-names (empty? table-names)))
    []
    (sql-jdbc.execute/reducible-query db (describe-fks-sql driver args))))

(defn describe-table-indexes
  "Default implementation of [[metabase.driver/describe-table-indexes]] for SQL JDBC drivers. Uses JDBC DatabaseMetaData."
  [driver db table]
  (sql-jdbc.execute/do-with-connection-with-options
   driver
   db
   nil
   (fn [^Connection conn]
     ;; https://docs.oracle.com/javase/8/docs/api/java/sql/DatabaseMetaData.html#getIndexInfo-java.lang.String-java.lang.String-java.lang.String-boolean-boolean-
     (with-open [index-info-rs (.getIndexInfo (.getMetaData conn)
                                              nil ;; catalog
                                              (:schema table)
                                              (:name table)
                                              ;; when true, return only indices for unique values when
                                              ;; false, return indices regardless of whether unique or not
                                              false
                                              ;; when true, result is allowed to reflect approximate or out of data
                                              ;; values. when false, results are requested to be accurate
                                              false)]
       (->> (vals (group-by :index_name (into []
                                              ;; filtered indexes are ignored
                                              (filter #(nil? (:filter_condition %)))
                                              (jdbc/reducible-result-set index-info-rs {}))))
            (keep (fn [idx-values]
                    ;; we only sync columns that are either singlely indexed or is the first key in a composite index
                    (when-let [index-name (some :column_name (sort-by :ordinal_position idx-values))]
                      {:type  :normal-column-index
                       :value index-name})))
            set)))))

(def ^:const max-nested-field-columns
  "Maximum number of nested field columns."
  100)

(def ^:private ^{:arglists '([s])} can-parse-datetime?
  "Returns whether a string can be parsed to an ISO 8601 datetime or not."
  (mr/validator ::lib.schema.literal/string.datetime))

(defn- type-by-parsing-string
  "Mostly just (type member) but with a bit to suss out strings which are ISO8601 and say that they are datetimes"
  [value]
  (if (and (string? value)
           (can-parse-datetime? value))
    java.time.LocalDateTime
    (type value)))

(defn- json-parser ^JsonParser [v]
  (let [f (JsonFactory.)]
    (if (string? v)
      (.createParser f ^String v)
      (.createParser f ^java.io.Reader v))))

(defn- number-type [t]
  (u/case-enum t
    JsonParser$NumberType/INT         Long
    JsonParser$NumberType/LONG        Long
    JsonParser$NumberType/FLOAT       Double
    JsonParser$NumberType/DOUBLE      Double
    JsonParser$NumberType/BIG_INTEGER clojure.lang.BigInt
    ;; there seem to be no way to encounter this, search in tests for `BigDecimal`
    JsonParser$NumberType/BIG_DECIMAL BigDecimal))

(defn- json-object?
  "Return true if the string `s` is a JSON where value is an object.

    (is-json-object \"{}\") => true
    (is-json-object \"[]\") => false
    (is-json-object \"\\\"foo\\\"\") => false"
  [^String s]
  (= JsonToken/START_OBJECT (-> s json-parser .nextToken)))

(defn- json->types
  "Parses given json (a string or a reader) into a map of paths to types, i.e. `{[\"bob\"} String}`.

  Uses Jackson Streaming API to skip allocating data structures, eschews allocating values when possible.
  Respects [[nested-field-columns-max-row-length]]."
  [v path]
  (if-not (json-object? v)
    {}
    (let [p (json-parser v)]
      (loop [path      (or path [])
             field     nil
             res       (transient {})]
        (let [token (.nextToken p)]
          (cond
           (nil? token)
           (persistent! res)

           ;; we could be more precise here and issue warning about nested fields (the one in `describe-json-fields`),
           ;; but this limit could be hit by multiple json fields (fetched in `describe-json-fields`) rather than only
           ;; by this one. So for the sake of issuing only a single warning in logs we'll spill over limit by a single
           ;; entry (instead of doing `<=`).
           (< max-nested-field-columns (count res))
           (persistent! res)

           :else
           (u/case-enum token
             JsonToken/VALUE_NUMBER_INT   (recur path field (assoc! res (conj path field) (number-type (.getNumberType p))))
             JsonToken/VALUE_NUMBER_FLOAT (recur path field (assoc! res (conj path field) (number-type (.getNumberType p))))
             JsonToken/VALUE_TRUE         (recur path field (assoc! res (conj path field) Boolean))
             JsonToken/VALUE_FALSE        (recur path field (assoc! res (conj path field) Boolean))
             JsonToken/VALUE_NULL         (recur path field (assoc! res (conj path field) nil))
             JsonToken/VALUE_STRING       (recur path field (assoc! res (conj path field)
                                                                    (type-by-parsing-string (.getText p))))
             JsonToken/FIELD_NAME         (recur path (.getText p) res)
             JsonToken/START_OBJECT       (recur (cond-> path field  (conj field)) field res)
             JsonToken/END_OBJECT         (recur (cond-> path (seq path) pop) field res)
             ;; We put top-level array row type semantics on JSON roadmap but skip for now
             JsonToken/START_ARRAY        (do (.skipChildren p)
                                              (if field
                                                (recur path field (assoc! res (conj path field) clojure.lang.PersistentVector))
                                                (recur path field res)))
             JsonToken/END_ARRAY          (recur path field res))))))))

(defn- json-map->types [json-map]
  (apply merge (map #(json->types (second %) [(first %)]) json-map)))

(defn- describe-json-rf
  "Reducing function that takes a bunch of maps from json-map->types,
  and gets them to conform to the type hierarchy,
  going through and taking the lowest common denominator type at each pass,
  ignoring the nils."
  ([] nil)
  ([acc-field-type-map] acc-field-type-map)
  ([acc-field-type-map second-field-type-map]
   (into {}
         (for [json-column (set/union (set (keys second-field-type-map))
                                      (set (keys acc-field-type-map)))]
           (cond
             (or (nil? acc-field-type-map)
                 (nil? (acc-field-type-map json-column))
                 (= (hash (acc-field-type-map json-column))
                    (hash (second-field-type-map json-column))))
             [json-column (second-field-type-map json-column)]

             (or (nil? second-field-type-map)
                 (nil? (second-field-type-map json-column)))
             [json-column (acc-field-type-map json-column)]

             (every? #(isa? % Number) [(acc-field-type-map json-column)
                                       (second-field-type-map json-column)])
             [json-column java.lang.Number]

             (every?
               (fn [column-type]
                 (some (fn [allowed-type]
                         (isa? column-type allowed-type))
                       [String Number Boolean java.time.LocalDateTime]))
               [(acc-field-type-map json-column) (second-field-type-map json-column)])
             [json-column java.lang.String]

             :else
             [json-column nil])))))

(def field-type-map
  "Map from Java types for deserialized JSON (so small subset of Java types) to MBQL types.

  We actually do deserialize the JSON in order to determine types,
  so the java / clojure types we get have to be matched to MBQL types"
  {java.lang.String                :type/Text
   ;; JSON itself has the single number type, but Java serde of JSON is stricter
   java.lang.Long                  :type/Integer
   clojure.lang.BigInt             :type/BigInteger
   java.math.BigInteger            :type/BigInteger
   java.lang.Integer               :type/Integer
   java.lang.Double                :type/Float
   java.lang.Float                 :type/Float
   java.math.BigDecimal            :type/Decimal
   java.lang.Number                :type/Number
   java.lang.Boolean               :type/Boolean
   java.time.LocalDateTime         :type/DateTime
   clojure.lang.PersistentVector   :type/Array
   clojure.lang.PersistentArrayMap :type/Structured
   clojure.lang.PersistentHashMap  :type/Structured})

(def db-type-map
  "Map from MBQL types to database types.

  This is the lowest common denominator of types, hopefully,
  although as of writing this is just geared towards Postgres types"
  {:type/Text       "text"
   :type/Integer    "bigint"
   ;; You might think that the ordinary 'bigint' type in Postgres and MySQL should be this.
   ;; However, Bigint in those DB's maxes out at 2 ^ 64.
   ;; JSON, like Javascript itself, will happily represent 1.8 * (10^308),
   ;; Losing digits merrily along the way.
   ;; We can't really trust anyone to use MAX_SAFE_INTEGER, in JSON-land..
   ;; So really without forcing arbitrary precision ('decimal' type),
   ;; we have too many numerical regimes to test.
   ;; (#22732) was basically the consequence of missing one.
   :type/BigInteger "decimal"
   :type/Float      "double precision"
   :type/Number     "double precision"
   :type/Decimal    "decimal"
   :type/Boolean    "boolean"
   :type/DateTime   "timestamp"
   :type/Array      "text"
   :type/Structured "text"})

(defn- field-types->fields [field-types]
  (let [valid-fields (for [[field-path field-type] (seq field-types)]
                       (if (nil? field-type)
                         nil
                         (let [curr-type (get field-type-map field-type :type/*)]
                           {:name              (str/join " \u2192 " (map name field-path)) ;; right arrow
                            :database-type     (db-type-map curr-type)
                            :base-type         curr-type
                            ;; Postgres JSONB field, which gets most usage, doesn't maintain JSON object ordering...
                            :database-position 0
                            :json-unfolding    false
                            :visibility-type   :normal
                            :nfc-path          field-path})))
        field-hash   (apply hash-set (filter some? valid-fields))]
    field-hash))

(defn- table->unfold-json-fields
  "Given a table return a list of json fields that need to unfold."
  [driver conn table]
  (let [table-fields (describe-table-fields driver conn table nil)
        json-fields  (filter #(isa? (:base-type %) :type/JSON) table-fields)]
    (if-not (seq json-fields)
      #{}
      (let [existing-fields-by-name (m/index-by :name (t2/select Field :table_id (u/the-id table)))
            should-not-unfold?      (fn [field]
                                      (when-let [existing-field (existing-fields-by-name (:name field))]
                                        (false? (:json_unfolding existing-field))))]
        (remove should-not-unfold? json-fields)))))

(setting/defsetting nested-field-columns-value-length-limit
  (deferred-tru (str "Maximum length of a JSON string before skipping it during sync for JSON unfolding. If this is set "
                     "too high it could lead to slow syncs or out of memory errors."))
  :visibility :internal
  :export?    true
  :type       :integer
  :default    50000)

(defn- sample-json-row-honey-sql
  "Return a honeysql query used to get row sample to describe json columns.

  If the table has PKs, try to fetch both first and last rows (see #25744).
  Else fetch the first n rows only."
  [driver table-identifier json-field-identifiers pk-identifiers]
  (let [pks-expr         (mapv vector pk-identifiers)
        table-expr       [table-identifier]
        json-field-exprs (mapv (fn [field]
                                 (if (= (driver.sql/json-field-length driver field) ::driver.sql/nyi)
                                   [field]
                                   [[:case
                                     [:<
                                      [:inline (nested-field-columns-value-length-limit)]
                                      (driver.sql/json-field-length driver field)]
                                     nil
                                     :else
                                     field]
                                    (last (h2x/identifier->components field))]))
                               json-field-identifiers)]
    (if (seq pk-identifiers)
      {:select json-field-exprs
       :from   [table-expr]
       ;; mysql doesn't support limit in subquery, so we're using inner join here
       :join   [[{:union-all [{:nest {:select   pks-expr
                                      :from     [table-expr]
                                      :order-by (mapv #(vector % :asc) pk-identifiers)
                                      :limit    (/ metadata-queries/nested-field-sample-limit 2)}}
                              {:nest {:select   pks-expr
                                      :from     [table-expr]
                                      :order-by (mapv #(vector % :desc) pk-identifiers)
                                      :limit    (/ metadata-queries/nested-field-sample-limit 2)}}]}
                 :result]
                (into [:and]
                      (for [pk-identifier pk-identifiers]
                        [:=
                         (h2x/identifier :field :result (last (h2x/identifier->components pk-identifier)))
                         pk-identifier]))]}
      {:select json-field-exprs
       :from   [table-expr]
       :limit  metadata-queries/nested-field-sample-limit})))

(defn- sample-json-reducible-query
  [driver jdbc-spec table json-fields pks]
  (let [table-identifier-info [(:schema table) (:name table)]
        json-field-identifiers (mapv #(apply h2x/identifier :field (into table-identifier-info [(:name %)])) json-fields)
        table-identifier (apply h2x/identifier :table table-identifier-info)
        pk-identifiers   (when (seq pks)
                           (mapv #(apply h2x/identifier :field (into table-identifier-info [%])) pks))
        sql-args         (sql.qp/format-honeysql
                          driver
                          (sample-json-row-honey-sql driver table-identifier json-field-identifiers pk-identifiers))]
    (jdbc/reducible-query jdbc-spec sql-args {:identifiers identity})))

(defn- describe-json-fields
  [driver jdbc-spec table json-fields pks]
  (log/infof "Inferring schema for %d JSON fields in %s" (count json-fields) (sync-util/name-for-logging table))
  (let [query       (sample-json-reducible-query driver jdbc-spec table json-fields pks)
        field-types (transduce (map json-map->types) describe-json-rf query)
        fields      (field-types->fields field-types)]
    (if (> (count fields) max-nested-field-columns)
      (do
        (log/warnf "More nested field columns detected than maximum. Limiting the number of nested field columns to %d."
                   max-nested-field-columns)
        (set (take max-nested-field-columns fields)))
      fields)))

;; The name's nested field columns but what the people wanted (issue #708)
;; was JSON so what they're getting is JSON.
(defmethod sql-jdbc.sync.interface/describe-nested-field-columns :sql-jdbc
  [driver database table]
  (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec database)]
    (sql-jdbc.execute/do-with-connection-with-options
      driver
      jdbc-spec
      nil
      (fn [^Connection conn]
        (let [unfold-json-fields (table->unfold-json-fields driver conn table)
              pks                (get-table-pks driver conn (:name database) table)]
          (if (empty? unfold-json-fields)
            #{}
            (describe-json-fields driver jdbc-spec table unfold-json-fields pks)))))))
