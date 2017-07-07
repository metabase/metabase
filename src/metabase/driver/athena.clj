(ns metabase.driver.athena
  (:require [clojure.java.jdbc :as jdbc]
            [clojure
             [string :as str]
             [walk :as walk]]
            [honeysql.core :as hsql]
            [metabase
             [config :as config]
             [db :as db]
             [driver :as driver]
             [util :as u]]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as sql-qp]
            [metabase.driver.generic-sql.util.unprepare :as unprepare]
            [metabase.query-processor.util :as qputil]
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
  [^com.amazonaws.athena.jdbc.AthenaResultSet rs]
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
  [{:keys [user password s3_staging_dir log_path url] :as details} query {:keys [read-fn] :as options}]
  (assert url)
  (assert user)
  (assert password)
  (assert s3_staging_dir)
  (assert log_path)
  (let [current-read-fn (if read-fn read-fn jdbc/result-set-seq)]
    (with-open [con (DriverManager/getConnection url (get-properties (dissoc details :url)))]
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
  [driver
   {:keys [log_path  password s3_staging_dir region user]
    :as   details}]
  (assert (or user password s3_staging_dir log_path region))
  (merge {:url (str "jdbc:awsathena://athena." region ".amazonaws.com:443")}
         (select-keys details [:log_path :s3_staging_dir :user :password])))

(defn- can-connect? [driver details]
  (let [details-with-tunnel (ssh/include-ssh-tunnel details)
        connection (connection-details->spec driver details-with-tunnel)]
    (= 1 (first (vals (first (run-query connection "SELECT 1" {})))))))

(defn- describe-database
  [driver {:keys [details] :as database}]
  (let [conn (connection-details->spec driver details)
        databases (->> (run-query conn "SHOW DATABASES" {})
                       (remove #(= (:database_name %) "default")) ; this table have permission issue if you use a role with limited permission
                       (map (fn [{:keys [database_name]}]
                              {:name database_name :schema nil}))
                       set)
        tables (->> databases
                    (map (fn [{:keys [name] :as table}]
                           (let [tables (run-query conn(str "SHOW TABLES IN " name) {})]
                             (map (fn [{:keys [tab_name]}] (assoc table :name (str name "." tab_name)))
                                  tables))))
                    flatten
                    set)]
    {:tables tables}))

(defn- describe-table-fields
  [conn {:keys [name schema]}]
  (set (for [{:keys [name type]} (run-query conn (str "DESCRIBE " name ";") {:read-fn describe-all-database->clj})]
         {:name name :base-type (or (column->base-type (keyword type))
                                    :type/*)})))

(defn- describe-table [driver database table]
  (let [conn (connection-details->spec driver (:details database))]
    (assoc (select-keys table [:name :schema]) :fields (describe-table-fields conn table))))

(defn- execute-query
  [driver {:keys [database settings], query :native, :as outer-query}]
  (let [final-query (str "-- " (qputil/query->remark outer-query) "\n"
                               (unprepare/unprepare (concat [(:query query)] (:params query)) :quote-escape "'"))
        results (run-query (connection-details->spec driver (:details database)) final-query {})
        columns (into [] (keys (first results)))
        rows (->> results
                  (map vals)
                  (map #(into [] %)))]
    {:columns columns
     :rows rows}))

(def features
  #{:basic-aggregations
    :standard-deviation-aggregations
    :expressions
    :expression-aggregations
    :native-parameters})

(defn- string-length-fn [field-key]
  (hsql/call :char_length field-key))

(defn- unix-timestamp->timestamp [expr seconds-or-milliseconds]
  (case seconds-or-milliseconds
    :seconds      (hsql/call :from_unixtime expr)
    :milliseconds (recur (hx// expr 1000) :seconds)))

(defn- date-format [format-str expr]
  (hsql/call :date_format expr (hx/literal format-str)))

(defn- str-to-date [format-str expr]
  (hsql/call :date_parse expr (hx/literal format-str)))

(defn- trunc-with-format [format-str expr]
  (str-to-date format-str (date-format format-str expr)))

(defn- date [unit expr]
   (case unit
     :default expr
     :minute (trunc-with-format "%Y-%m-%d %H:%i" expr)
     :minute-of-hour (hsql/call :minute expr)
     :hour (trunc-with-format "%Y-%m-%d %H" expr)
     :hour-of-day (hsql/call :hour expr)
     :day (trunc-with-format "%Y-%m-%d" expr)
     :day-of-week (hx/->integer (date-format "u"
                                             (hx/+ expr
                                                   (hsql/raw "interval '1' day"))))
     :day-of-month (hsql/call :dayofmonth expr)
     :day-of-year (hx/->integer (date-format "D" expr))
     :week (hsql/call :date_sub
                      (hx/+ expr
                            (hsql/raw "interval 1 day"))
                      (hsql/call :date_format
                                 (hx/+ expr
                                       (hsql/raw "interval 1 day"))
                                 "u"))
     :week-of-year (hsql/call :weekofyear expr)
     :month (hsql/call :trunc expr (hx/literal :MM))
     :month-of-year (hsql/call :month expr)
     :quarter (hsql/call :add_months
                         (hsql/call :trunc expr (hx/literal :year))
                         (hx/* (hx/- (hsql/call :quarter expr)
                                     1)
                               3))
     :quarter-of-year (hsql/call :quarter expr)
     :year (hsql/call :year expr)))

(defn- date-interval [unit amount]
  (hsql/raw (format "(NOW() + INTERVAL '%d' %s)" (int amount) (name unit))))

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
            true
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
          ; FIXME : Asking 1000 elements leads to a driver exception
          unqualify-honey-form2 (if (and (:limit unqualify-honey-form)
                                         (> (:limit unqualify-honey-form) 950))
                                  (assoc unqualify-honey-form :limit 950)
                                  unqualify-honey-form)
          [sql & args]  (sql/honeysql-form->sql+args driver unqualify-honey-form2)
          athena-sql (unquote-table-name sql (get-in inner-query [:source-table :name]))]
      {:query  athena-sql
       :params args})))

(defrecord Athena []
  clojure.lang.Named
  (getName [_] "Athena"))

(u/strict-extend Athena
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?              can-connect?
          :date-interval             (u/drop-first-arg date-interval)
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
          :features (constantly features)
          :field-values-lazy-seq (resolve 'metabase.driver.generic-sql.query-processor/field-values-lazy-seq)
          :mbql->native mbql->native})

  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:active-tables             sql/post-filtered-active-tables
          :column->base-type         (u/drop-first-arg column->base-type)
          :connection-details->spec  (u/drop-first-arg connection-details->spec)
          :date                      (u/drop-first-arg date)
          :excluded-schemas          (constantly #{"default"})
          :quote-style               (constantly :ansi)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :unix-timestamp->timestamp (u/drop-first-arg unix-timestamp->timestamp)}))

(when (u/ignore-exceptions
       (Class/forName "com.amazonaws.athena.jdbc.AthenaDriver"))
  (driver/register-driver! :athena (Athena.)))
