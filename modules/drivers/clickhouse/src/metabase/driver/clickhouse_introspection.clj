(ns metabase.driver.clickhouse-introspection
  (:refer-clojure :exclude [empty? every? mapv])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [instaparse.combinators :as insta.c]
   [instaparse.core :as insta]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [empty? every? mapv]])
  (:import
   (java.sql Connection DatabaseMetaData)))

(set! *warn-on-reflection* true)

(def ^:private database-type->base-type
  (sql-jdbc.sync/pattern-based-database-type->base-type
   [[#"array"       :type/Array]
    [#"bool"        :type/Boolean]
    [#"date"        :type/Date]
    [#"date32"      :type/Date]
    [#"decimal"     :type/Decimal]
    [#"enum8"       :type/Text]
    [#"enum16"      :type/Text]
    [#"fixedstring" :type/TextLike]
    [#"float32"     :type/Float]
    [#"float64"     :type/Float]
    [#"int8"        :type/Integer]
    [#"int16"       :type/Integer]
    [#"int32"       :type/Integer]
    [#"int64"       :type/BigInteger]
    [#"ipv4"        :type/IPAddress]
    [#"ipv6"        :type/IPAddress]
    [#"map"         :type/Dictionary]
    [#"string"      :type/Text]
    [#"tuple"       :type/*]
    [#"uint8"       :type/Integer]
    [#"uint16"      :type/Integer]
    [#"uint32"      :type/Integer]
    [#"uint64"      :type/BigInteger]
    [#"uuid"        :type/UUID]]))

(defn variant-or-dynamic?
  "Is `database-type` a `Variant` or `Dynamic` type? Each value of these can have another type, and ClickHouse does not
  allow them in GROUP BY, ORDER BY or aggregations. So they are text, and queries cast them to String."
  [database-type]
  (when-let [db-type (some-> database-type u/lower-case-en)]
    (or (str/starts-with? db-type "variant(")
        (= db-type "dynamic")
        (str/starts-with? db-type "dynamic("))))

(defn- normalize-db-type
  [db-type]
  (cond
    ;; LowCardinality
    (str/starts-with? db-type "lowcardinality")
    (normalize-db-type (subs db-type 15 (dec (count db-type))))
    ;; Nullable
    (str/starts-with? db-type "nullable")
    (normalize-db-type (subs db-type 9 (dec (count db-type))))
    ;; for test purposes only: GMT0 is a legacy timezone;
    ;; it maps to LocalDateTime instead of OffsetDateTime
    ;; (= db-type "datetime64(3, 'gmt0')")
    ;; :type/DateTime
    ;; DateTime64
    (str/starts-with? db-type "datetime64")
    (if (> (count db-type) 13) :type/DateTimeWithLocalTZ :type/DateTime)
    ;; DateTime
    (str/starts-with? db-type "datetime")
    (if (> (count db-type) 8) :type/DateTimeWithLocalTZ :type/DateTime)
    ;; Enum*
    (str/starts-with? db-type "enum")
    :type/Text
    ;; Variant, Dynamic
    (variant-or-dynamic? db-type)
    :type/Text
    ;; Map
    (str/starts-with? db-type "map")
    :type/Dictionary
    ;; Tuple
    (str/starts-with? db-type "tuple")
    :type/*
    ;; JSON, JSON(<typed paths>)
    (or (= db-type "json") (str/starts-with? db-type "json("))
    :type/JSON
    ;; SimpleAggregateFunction
    (str/starts-with? db-type "simpleaggregatefunction")
    (normalize-db-type (subs db-type (+ (str/index-of db-type ",") 2) (dec (count db-type))))
    ;; _
    :else (or (database-type->base-type (keyword db-type)) :type/*)))

;; Enum8(UInt8) -> :type/Text, DateTime64(Europe/Amsterdam) -> :type/DateTime,
;; Nullable(DateTime) -> :type/DateTime, SimpleAggregateFunction(sum, Int64) -> :type/BigInteger, etc
(defmethod sql-jdbc.sync/database-type->base-type :clickhouse
  [_ database-type]
  (let [db-type (if (keyword? database-type)
                  (subs (str database-type) 1)
                  database-type)]
    (normalize-db-type (u/lower-case-en db-type))))

(defmethod sql-jdbc.sync/excluded-schemas :clickhouse [_]
  #{"system" "information_schema" "INFORMATION_SCHEMA"})

(def ^:private allowed-table-types
  (into-array String
              ["TABLE" "VIEW" "FOREIGN TABLE" "REMOTE TABLE" "DICTIONARY"
               "MATERIALIZED VIEW" "MEMORY TABLE" "LOG TABLE"]))

(defn- tables-set
  [tables]
  (set
   (for [table tables]
     (let [remarks (:remarks table)]
       {:name (:table_name table)
        :schema (:table_schem table)
        :description (when-not (str/blank? remarks) remarks)}))))

(defn- get-tables-from-metadata
  [^DatabaseMetaData metadata schema-pattern]
  (.getTables metadata
              nil            ; catalog - unused in the source code there
              schema-pattern
              "%"            ; tablePattern "%" = match all tables
              allowed-table-types))

(defn- not-inner-mv-table?
  [table]
  (not (str/starts-with? (:table_name table) ".inner")))

(defn- get-all-tables-in-all-dbs
  [driver db]
  (let [details             (driver.conn/effective-details db)
        db-filters-patterns (set (map (comp #(ddl.i/format-name driver %) str/trim)
                                      (remove empty? (str/split (or (:db-filters-patterns details) "") #","))))
        db-filters-type     (:db-filters-type details)]
    (sql-jdbc.execute/do-with-connection-with-options
     driver db nil
     (fn [^Connection conn]
       (->> (get-tables-from-metadata (.getMetaData conn) "%")
            jdbc/metadata-result
            vec
            (filter not-inner-mv-table?)
            (filter (fn [table]
                      (cond
                        (= db-filters-type "inclusion")
                        (contains? db-filters-patterns (:table_schem table))

                        (= db-filters-type "exclusion")
                        (and (not (contains? db-filters-patterns (:table_schem table)))
                             (not (contains? (sql-jdbc.sync/excluded-schemas driver) (:table_schem table))))

                        :else
                        (not (contains? (sql-jdbc.sync/excluded-schemas driver) (:table_schem table))))))
            tables-set)))))

;; Strangely enough, the tests only work with :db keyword,
;; but the actual sync from the UI uses :dbname
(defn- get-db-name
  [db]
  (let [details (driver.conn/effective-details db)]
    (or (:dbname details)
        (:db details))))

(defn- get-tables-in-db
  [driver db]
  (->> (let [db-name (ddl.i/format-name driver (or (get-db-name db) "default"))]
         (sql-jdbc.execute/do-with-connection-with-options
          driver db nil
          (fn [^Connection conn]
            (-> (.getMetaData conn)
                (get-tables-from-metadata db-name)
                jdbc/metadata-result))))
       (filter not-inner-mv-table?)
       (tables-set)
       (set)))

(defmethod driver/describe-database* :clickhouse
  [driver db]
  (let [{:keys [enable-multiple-db]} (driver.conn/effective-details db)
        tables (if (boolean enable-multiple-db)
                 (get-all-tables-in-all-dbs driver db)
                 (get-tables-in-db driver db))]
    {:tables tables}))

(defn- unquote-name
  "The name that the backquoted identifier `quoted` stands for."
  [quoted]
  (str/replace (subs quoted 1 (dec (count quoted))) #"\\(.)" "$1"))

(def ^:private type-token
  "A token of a ClickHouse type. The possessive `++` and `*+` stop a stack overflow on a long string."
  #"(?x)
    '(?:[^'\\]++|\\.)*+'   # a string, e.g. 'a, b'
  | `(?:[^`\\]++|\\.)*+`   # a quoted name, e.g. `my key`
  | [(),]                  # a delimiter
  | [^'`(),]+              # anything else")

(defn type-arguments
  "The arguments of `database-type` if it is a `type-name` type, or else nil. For example, the arguments of the `Map`
  type `Map(String, Tuple(a Int32, b Int32))` are `[\"String\" \"Tuple(a Int32, b Int32)\"]`."
  [type-name database-type]
  (let [prefix (str type-name "(")]
    (when (and (some-> database-type (str/starts-with? prefix))
               (str/ends-with? database-type ")"))
      (loop [[token & tokens] (re-seq type-token (subs database-type (count prefix) (dec (count database-type))))
             depth            0
             argument         []
             arguments        []]
        (cond
          (nil? token)
          (conj arguments (str/trim (str/join argument)))

          (and (= token ",") (zero? depth))
          (recur tokens depth [] (conj arguments (str/trim (str/join argument))))

          :else
          (recur tokens
                 (case token "(" (inc depth) ")" (dec depth) depth)
                 (conj argument token)
                 arguments))))))

(defn- named-element
  "The `[name type]` of a `Tuple` type argument such as `lat Float64`, or nil if it has no name."
  [argument]
  (let [token        (str (re-find type-token argument))
        quoted?      (str/starts-with? token "`")
        raw-name     (if quoted? token (re-find #"^\w+(?=\s)" token))
        element-name (cond-> raw-name quoted? unquote-name)
        element-type (str/trim (subs argument (count raw-name)))]
    (when element-name
      [element-name element-type])))

(defn tuple-elements
  "The `[name type]` of each element of `database-type` if it is a `Tuple` type with named elements, or else nil. For
  example, `Tuple(lat Float64, lon Float64)` has the elements `[[\"lat\" \"Float64\"] [\"lon\" \"Float64\"]]`."
  [database-type]
  (when-let [arguments (type-arguments "Tuple" database-type)]
    (let [elements (mapv named-element arguments)]
      (when (every? some? elements)
        elements))))

(defn- with-tuple-nested-fields
  "Add a nested field for each element of `field` if it is a named `Tuple`, so each element is a field of its own. An
  element that is a named tuple gets nested fields too."
  [{:keys [database-type database-position] :as field}]
  (if-let [elements (tuple-elements database-type)]
    (assoc field
           :base-type     :type/Dictionary
           :nested-fields (into #{}
                                (map (fn [[element-name element-type]]
                                       (with-tuple-nested-fields
                                         {:name              element-name
                                          :database-type     element-type
                                          :base-type         (sql-jdbc.sync/database-type->base-type :clickhouse element-type)
                                          :database-position database-position})))
                                elements)
           ;; the elements show all of its values
           :visibility-type :details-only)
    field))

(defn- ^:private is-db-required?
  [field]
  (not (str/starts-with? (get field :database-type) "Nullable")))

(defmethod driver/describe-table :clickhouse
  [_driver database table]
  (let [table-metadata (sql-jdbc.sync/describe-table :clickhouse database table)
        filtered-fields (for [field (:fields table-metadata)
                              :let [updated-field (-> field
                                                      (assoc :database-required (is-db-required? field))
                                                      with-tuple-nested-fields)]
                              ;; Skip all AggregateFunction (but keeping SimpleAggregateFunction) columns
                              ;; JDBC does not support that and it crashes the data browser
                              :when (not (re-matches #"^AggregateFunction\(.+$"
                                                     (get field :database-type)))]
                          updated-field)]
    (merge table-metadata {:fields (set filtered-fields)})))

(def ^:private primary-key-parser
  "Parses a ClickHouse primary key, as `system.tables` reports it: expressions separated by commas, perhaps wrapped in
  one pair of parentheses. An expression that is a bare column name is a `:column`; any other is an `:expression`, which
  is parsed only far enough to find where it ends."
  (insta/parser
   (merge
    (insta.c/ebnf
     "primary-key = <'('> columns <')'> / columns
      <columns>   = item (<','> item)*
      <item>      = column / expression
      column      = <space> (name / quoted-name) <space>
      expression  = (text / group)+
      <group>     = '(' (text / group / ',')* ')' | '[' (text / group / ',')* ']'
      <text>      = other / string / quoted-name")
    {:space       (insta.c/regexp #"\s*")
     :name        (insta.c/hide-tag (insta.c/regexp #"[A-Za-z_][A-Za-z0-9_]*"))
     :quoted-name (insta.c/regexp #"`(?:[^`\\]|\\.)*`")
     :string      (insta.c/regexp #"'(?:[^'\\]|\\.)*'")
     ;; everything up to the next comma, bracket, string or quoted name
     :other       (insta.c/regexp #"[^,()\[\]'`]+")})
   :start :primary-key))

(defn- primary-key-columns
  "The columns of the ClickHouse primary key `primary-key`, as `system.tables` reports it, that are bare columns."
  [primary-key]
  (if (str/blank? primary-key)
    []
    (let [tree (insta/parse primary-key-parser primary-key)]
      (if (insta/failure? tree)
        (do
          (log/warnf "Cannot parse the ClickHouse primary key %s; syncing the table without one" (pr-str primary-key))
          [])
        (insta/transform {:primary-key (fn [& columns]
                                         (into [] (remove nil?) columns))
                          :column      identity
                          :quoted-name unquote-name
                          :expression  (constantly nil)}
                         tree)))))

(defmethod sql-jdbc.describe-table/get-table-pks :clickhouse
  [_driver ^java.sql.Connection conn _db-name-or-nil table]
  ;; Not `DatabaseMetaData.getPrimaryKeys`: it splits `system.tables.primary_key` on every comma, so it reports `(id)`
  ;; for a table declared with `ORDER BY (id)` on recent ClickHouse versions, splits quoted names that contain a comma,
  ;; and names the pieces of expressions like `cityHash64(a, b)`. None of those matches a column.
  (with-open [stmt (.prepareStatement conn "SELECT primary_key FROM system.tables WHERE database = ? AND name = ?")]
    (.setString stmt 1 (:schema table))
    (.setString stmt 2 (:name table))
    (with-open [rs (.executeQuery stmt)]
      (if (.next rs)
        (primary-key-columns (.getString rs 1))
        []))))
