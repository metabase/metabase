(ns metabase.driver.athena
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [clojure
             [string :as str]
             [walk :as walk]]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [config :as config]
             [db :as db]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sql-qp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.driver.presto :as presto]
            [metabase.models
             [field :as field]
             [table :as table]]
            [metabase.query-processor.util :as qputil]
            [metabase.sync-database.analyze :as analyze]
            [metabase.util
             [honeysql-extensions :as hx]
             [ssh :as ssh]])

  (:import [java.sql DriverManager]
           [java.util Properties]))

(comment
 ; for REPL testing
 (require '[metabase.plugins :as plugins])
 (plugins/load-plugins!))

(defn- get-properties
  [{:keys [user password s3_staging_dir log_path] :as conf}]
  (assert (or user password s3_staging_dir log_path))
  (doto (Properties.)
        (.putAll (walk/stringify-keys conf))))

(defn- describe-database->clj
  "Workaround for wrong getColumnCount response by the driver"
  ;[^com.amazonaws.athena.jdbc.AthenaResultSet rs]
  [rs]
  (let [m (.getMetaData rs)
        cnt (.getColumnCount m)
        name-and-type (.getString rs 1)
        [name type] (map str/trim (str/split name-and-type #"\t"))]
    {:name name :type type}))

(defn- describe-all-database->clj
  [rs]
  (loop [result []
         more (.next rs)]
    (if-not more
            (->> result
                 (remove #(= (:name %) ""))
                 (remove #(str/starts-with? (:name %) "#")) ; remove comment
                 distinct) ; driver can return twice the partitioning fields
            (recur
             (conj result (describe-database->clj rs))
             (.next rs)))))

(defn- run-query
  "Workaround for avoiding the usage of 'advance' jdbc feature that are not implemented by the driver yet.
   Such as prepare statement"
  [database query {:keys [read-fn] :as options}]
  (let [current-read-fn (if read-fn read-fn (fn [rs] (into [] (jdbc/result-set-seq rs {:identifiers identity}))))]
    (log/info (format "Running Athena query : '%s'..." query))
    (with-open [con (jdbc/get-connection (sql/db->jdbc-connection-spec database))]
               (let [athena-stmt (.createStatement con)]
                 (->> (.executeQuery athena-stmt query)
                      current-read-fn)))))

(defn- column->base-type [column-type]
  ({:array      :type/*
    :bigint     :type/BigInteger
    :binary     :type/*
    :boolean    :type/Boolean
    :date       :type/Date
    :decimal    :type/Decimal
    :double     :type/Float
    :float      :type/Float
    :int        :type/Integer
    :map        :type/*
    :smallint   :type/Integer
    :string     :type/Text
    :struct     :type/*
    :timestamp  :type/DateTime
    :tinyint    :type/Integer
    :uniontype  :type/*
    :varchar    :type/Text} (keyword column-type)))

(defn- connection-details->spec
  "Create a database specification for an Athena database. DETAILS should include keys for `:user`,
   `:password`, `:s3_staging_dir` `:log_path` and `region`"
  [{:keys [log_path  password s3_staging_dir region user] :as details}]
  (assert (or user password s3_staging_dir log_path region))
  {:classname "com.amazonaws.athena.jdbc.AthenaDriver"
   :log_path log_path
   :subprotocol "awsathena"
   :subname (str "//athena." region ".amazonaws.com:443")
   :user user
   :password password
   :s3_staging_dir s3_staging_dir})

(defn- can-connect? [driver details]
  (let [details-with-tunnel (ssh/include-ssh-tunnel details)]
    (with-open [connection (jdbc/get-connection (connection-details->spec details-with-tunnel))]
               (let [athena-stmt (.createStatement connection)
                     result (->> (.executeQuery athena-stmt "SELECT 1")
                                 jdbc/result-set-seq)]
                 (= 1 (first (vals (first result))))))))

(defn- describe-database
  [driver {:keys [details] :as database}]
  (let [databases (->> (run-query database "SHOW DATABASES" {})
                       (remove #(= (:database_name %) "default")) ; this table have permission issue if you use a role with limited permission
                       (map (fn [{:keys [database_name]}]
                              {:name database_name :schema nil}))
                       set)
        tables (->> databases
                    (map (fn [{:keys [name] :as table}]
                           (let [tables (run-query database (str "SHOW TABLES IN " name) {})]
                             (map (fn [{:keys [tab_name]}] (assoc table :schema name :name tab_name))
                                  tables))))
                    flatten
                    set)]
    {:tables tables}))

(defn- describe-table-fields
  [database {:keys [name schema]}]
  (set (for [{:keys [name type]} (run-query database (str "DESCRIBE " schema "." name ";") {:read-fn describe-all-database->clj})]
         {:name name :base-type (or (column->base-type (keyword type))
                                    :type/*)})))

(defn- describe-table [driver database table]
  (assoc (select-keys table [:name :schema]) :fields (describe-table-fields database table)))

(defn- execute-query
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [final-query (str "-- " (qputil/query->remark outer-query) "\n"
                               (unprepare/unprepare (concat [(:query query)] (:params query)) :quote-escape "'"))
        results (run-query database final-query {})
        columns (into [] (keys (first results)))
        rows (->> results
                  (map vals)
                  (map #(into [] %)))]
    {:columns columns
     :rows rows}))

(def features
  #{:basic-aggregations
    :standard-deviation-aggregations
    ;:expressions
    ;:expression-aggregations
    :native-parameters})

(defn- string-length-fn [field-key]
  (hsql/call :char_length field-key))

(defn- unqualify-honey-fields [form-str form-length fields]
  (mapv (fn [[f v]]
          (if (str/starts-with? (str f) form-str)
            [(keyword (subs (str f) form-length)) v]
            [f v]))
        fields))

(defn- unqualify-query
  "Another workaround for incompatible SQL implementation : Remove qualify select"
  [{:keys [from select group-by order-by] :as honey-query}]
  ; FIXME won't works on multiple table
  (let [from-str (str (first from))
        from-length (inc (count from-str))]
    (cond-> honey-query
            (not-empty (:select honey-query))
            (update :select (fn [selects]
                              (mapv (fn [[f v]]
                                      (if (str/starts-with? (str f) from-str)
                                        [(keyword (subs (str f) from-length)) v]
                                        [f v]))
                                    selects)))

            (not-empty (:where honey-query))
            (update :where (fn [where-clauses]
                             (reduce
                              (fn [acc e]
                                (if (sequential? e)
                                  (let [[op field & other] e
                                        new-field (if (str/starts-with? (str field) from-str)
                                                    (keyword (subs (str field) from-length))
                                                    field)]
                                    (conj acc (concat [op field] other)))
                                  (conj acc e)))
                              []
                              where-clauses)))

            (not-empty (:group-by honey-query))
            (update :group-by (fn [fields]
                                (mapv (fn [f]
                                        (if (str/starts-with? (str f) from-str)
                                          (keyword (subs (str f) from-length))
                                          f))
                                      fields)))

            (not-empty (:order-by honey-query))
            (update :order-by (fn [fields]
                                (mapv (fn [[f v]]
                                        (if (str/starts-with? (str f) from-str)
                                          [(keyword (subs (str f) from-length)) v]
                                          [f v]))
                                      fields))))))

(defn- unquote-table-name
  "Workaround for unquoting table name as the JDBC api does not support this feature"
  [sql-string table-name]
  (let [sp (str/split table-name #"\.")
        table-name-quote (str/join "." (map (fn [s] (str "\"" s "\"")) sp))]
    (str/replace sql-string (str "\"" table-name "\"") table-name)))

(defn- mbql->native
  "Transpile MBQL query into a native SQL statement."
  [driver {inner-query :query, database :database, :as outer-query}]
  (binding [metabase.driver.generic-sql.query-processor/*query* outer-query]
    (let [honeysql-form (sql-qp/build-honeysql-form driver outer-query)
          unqualify-honey-form (unqualify-query honeysql-form)
          [sql & args]  (sql/honeysql-form->sql+args driver unqualify-honey-form)
          athena-sql (unquote-table-name sql (get-in inner-query [:source-table :name]))]
      {:query  athena-sql
       :params args})))

(defn- quote-name [nm]
  (str \" (str/replace nm "\"" "\"\"") \"))

(defn- quote+combine-names [& names]
  (str/join \. (map quote-name names)))

(defn- field-avg-length [{field-name :name, :as field}]
  (let [table             (field/table field)
        {:keys [details]} (table/database table)
        sql               (format "SELECT cast(round(avg(length(%s))) AS integer) FROM %s WHERE %s IS NOT NULL"
                            (quote-name field-name)
                            (quote+combine-names (:schema table) (:name table))
                            (quote-name field-name))
        result     (run-query {:details details :engine :athena} sql {})
        v (:_col0 (first result))]
    (or v 0)))

(defn- field-percent-urls [{field-name :name, :as field}]
  (let [table             (field/table field)
        {:keys [details]} (table/database table)
        sql               (format "SELECT cast(count_if(url_extract_host(%s) <> '') AS double) / cast(count(*) AS double) FROM %s WHERE %s IS NOT NULL"
                            (quote-name field-name)
                            (quote+combine-names (:schema table) (:name table))
                            (quote-name field-name))
        result            (run-query {:details details :engine :athena} sql {})
        v (:_col0 (first result))]
    (if (= v "NaN") 0.0 v)))

;; It take a really long time. I'm not sure that feature is worth it for thris driver
(defn- analyze-table
  [driver table new-table-ids]
  ((analyze/make-analyze-table driver
     :field-avg-length-fn   field-avg-length
     :field-percent-urls-fn field-percent-urls) driver table new-table-ids))

(defn- field-values-lazy-seq [{field-name :name, :as field}]
  (let [table             (field/table field)
        {:keys [details]} (table/database table)
        sql               (format "SELECT %s FROM %s LIMIT %d"
                            (quote-name field-name)
                            (quote+combine-names (:schema table) (:name table))
                            driver/max-sync-lazy-seq-results)
        {:keys [rows]}    (run-query {:details details :engine :athena} sql {})]
    (for [row rows]
      (first row))))

(defrecord AthenaDriver []
  clojure.lang.Named
  (getName [_] "Athena"))

(u/strict-extend AthenaDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:analyze-table             (constantly nil) ;analyze-table)
          :can-connect?              can-connect?
          :date-interval             (u/drop-first-arg presto/date-interval)
          :describe-database         describe-database
          :describe-table            describe-table
          :describe-table-fks        (constantly nil)
          :details-fields (constantly (ssh/with-tunnel-config
                                       [{:name         "region"
                                         :display-name "Region"
                                         :placeholder  "us-east-1"
                                         :required     true}
                                        {:name         "log_path"
                                         :display-name "Log Path"
                                         :placeholder  "/tmp/athena.log"
                                         :default      "/tmp/athena.log"}
                                        {:name         "s3_staging_dir"
                                         :display-name "Staging dir"
                                         :placeholder  "s3://YOUR_BUCKET/aws-athena-query-results-report"}
                                        {:name         "user"
                                         :display-name "AWS access key"
                                         :required     true}
                                        {:name         "password"
                                         :display-name "AWS secret key"
                                         :type         :password
                                         :placeholder  "*******"
                                         :required     true}]))
          :execute-query             execute-query
          :features                 (constantly features)
          :field-values-lazy-seq    (u/drop-first-arg field-values-lazy-seq)
          :mbql->native mbql->native
          :table-rows-seq (constantly nil)})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:apply-page                (u/drop-first-arg presto/apply-page)
          :active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :current-datetime-fn       (constantly :%now);(constantly :%current_timestamp)
          ;:date                      (u/drop-first-arg date)
          :date                      (u/drop-first-arg metabase.driver.presto/date)
          :excluded-schemas          (constantly #{"default"})
          :field-percent-urls        (u/drop-first-arg field-percent-urls)
          :prepare-value             (u/drop-first-arg presto/prepare-value)
          :quote-style               (constantly :ansi)
          :string-length-fn          (u/drop-first-arg presto/string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg presto/unix-timestamp->timestamp)}))

(when (u/ignore-exceptions
       (Class/forName "com.amazonaws.athena.jdbc.AthenaDriver"))
  (driver/register-driver! :athena (AthenaDriver.)))
