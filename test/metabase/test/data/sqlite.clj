(ns metabase.test.data.sqlite
  (:require [honeysql.core :as hsql]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]
            [metabase.util
             [date :as du]
             [honeysql-extensions :as hx]]))

(sql-jdbc.tx/add-test-extensions! :sqlite)

(defmethod tx/dbdef->connection-details :sqlite [_ context dbdef]
  {:db (str (tx/escaped-name dbdef) ".sqlite")})

(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/BigInteger] [_ _] "BIGINT")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Boolean]    [_ _] "BOOLEAN")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/DateTime]   [_ _] "DATETIME")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Float]      [_ _] "DOUBLE")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Text]       [_ _] "TEXT")
(defmethod sql.tx/field-base-type->sql-type [:sqlite :type/Time]       [_ _] "TIME")

(defn- load-data-stringify-dates
  "Our SQLite JDBC driver doesn't seem to like Dates/Timestamps so just convert them to strings before INSERTing them
  into the Database."
  [insert!]
  (fn [rows]
    (insert! (for [row rows]
               (into {} (for [[k v] row]
                          [k (cond
                               (instance? java.sql.Time v)
                               (hsql/call :time (hx/literal (du/format-time v "UTC")))

                               (instance? java.util.Date v)
                               (hsql/call :datetime (hx/literal (du/date->iso-8601 v)))

                               :else v)]))))))

(defmethod sql.tx/pk-sql-type :sqlite [_] "INTEGER")

(defmethod execute/execute-sql! :sqlite [& args]
  (apply execute/sequentially-execute-sql! args))

(let [load-data! (load-data/make-load-data-fn load-data-stringify-dates load-data/load-data-chunked)]
  (defmethod load-data/load-data! :sqlite [& args]
    (apply load-data! args)))

(defmethod sql.tx/drop-db-if-exists-sql :sqlite [& _] nil)
(defmethod sql.tx/create-db-sql         :sqlite [& _] nil)
(defmethod sql.tx/add-fk-sql            :sqlite [& _] nil) ; TODO - fix me
