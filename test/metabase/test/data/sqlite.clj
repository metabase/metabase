(ns metabase.test.data.sqlite
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.data.sql-jdbc.execute :as execute]))

(set! *warn-on-reflection* true)

(sql-jdbc.tx/add-test-extensions! :sqlite)

(defmethod driver/database-supports? [:sqlite :test/timestamptz-type]
  [_driver _feature _database]
  false)

(defn- db-file-name [dbdef]
  (str (tx/escaped-database-name dbdef) ".sqlite"))

(defmethod tx/dbdef->connection-details :sqlite
  [_driver _context dbdef]
  {:db (db-file-name dbdef)})

(doseq [[base-type sql-type] {:type/BigInteger "BIGINT"
                              :type/Boolean    "BOOLEAN"
                              :type/Date       "DATE"
                              :type/DateTime   "DATETIME"
                              :type/Decimal    "DECIMAL"
                              :type/Float      "DOUBLE"
                              :type/Integer    "INTEGER"
                              :type/Text       "TEXT"
                              :type/Time       "TIME"}]
  (defmethod sql.tx/field-base-type->sql-type [:sqlite base-type] [_ _] sql-type))

(defmethod sql.tx/pk-sql-type :sqlite [_] "INTEGER")

(defmethod tx/aggregate-column-info :sqlite
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Integer}))))

(defmethod execute/execute-sql! :sqlite [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/drop-db-if-exists-sql :sqlite [& _] nil)
(defmethod sql.tx/create-db-sql         :sqlite [& _] nil)
(defmethod sql.tx/add-fk-sql            :sqlite [& _] nil) ; SQLite FKs have to be added at Table creation time

(defmethod sql.tx/create-table-sql :sqlite
  [driver {:keys [database-name], :as dbdef} {:keys [table-name field-definitions], :as _tabledef}]
  (letfn [(spaces [& args]
            (interpose \space args))
          (table [table-name]
            (sql.tx/qualify-and-quote driver database-name table-name))
          (commas [& args]
            (interpose ", " args))
          (sql-list [& args]
            (concat ["("] (apply commas args) [")"]))
          (field [field-name]
            (sql.tx/format-and-quote-field-name driver field-name))
          (field-def [field-definition]
            (sql.tx/field-definition-sql driver field-definition))
          (field-defs []
            (map field-def field-definitions))
          (primary-key []
            (spaces
             "PRIMARY KEY"
             (apply sql-list (map field (sql.tx/fielddefs->pk-field-names field-definitions)))))
          (foreign-key [field-definition]
            (let [dest-table-name (name (:fk field-definition))
                  pk-names        (->> (sql.tx/get-tabledef dbdef dest-table-name)
                                       :field-definitions
                                       sql.tx/fielddefs->pk-field-names)]
              (spaces
               "FOREIGN KEY"
               (sql-list (field (:field-name field-definition)))
               "REFERENCES"
               (table dest-table-name)
               (apply sql-list (map field pk-names)))))
          (foreign-keys []
            (->> field-definitions
                 (filter :fk)
                 (map foreign-key)))]
    (let [parts (spaces
                 "CREATE TABLE"
                 (table table-name)
                 (apply sql-list (concat (field-defs)
                                         [(primary-key)]
                                         (foreign-keys))))]
      (str/join (flatten parts)))))

(deftest ^:parallel create-table-ddl-test
  (testing "CREATE TABLE for SQLite should include inline FOREIGN KEY declarations (#45788, QUE2-59)"
    (let [db-def    {:database-name     "country"
                     :table-definitions [{:table-name        "continent"
                                          :field-definitions [{:field-name    "id"
                                                               :base-type     {:native "INTEGER"}
                                                               :semantic-type :type/PK
                                                               :pk?           true}]}
                                         {:table-name        "country"
                                          :field-definitions [{:field-name    "id"
                                                               :base-type     {:native "INTEGER"}
                                                               :semantic-type :type/PK
                                                               :pk?           true}
                                                              {:field-name "name"
                                                               :base-type  :type/Text}
                                                              {:field-name "continent_id"
                                                               :base-type  :type/Integer
                                                               :fk         :continent}]}]}
          table-def (second (:table-definitions db-def))
          sql       (sql.tx/create-table-sql :sqlite db-def table-def)]
      (is (= ["CREATE TABLE \"country\" ("
              "  \"id\" INTEGER,"
              "  \"name\" TEXT,"
              "  \"continent_id\" INTEGER,"
              "  PRIMARY KEY (\"id\"),"
              "  FOREIGN KEY (\"continent_id\") REFERENCES \"continent\" (\"id\")"
              ")"]
             (str/split-lines (driver/prettify-native-form :sqlite sql)))))))

(deftest ^:parallel create-table-ddl-test-2
  (testing "CREATE TABLE for SQLite should include inline FOREIGN KEY declarations should handle custom PKs (#45788, QUE2-59)"
    (let [db-def    (mt/dataset-definition "custom-pk"
                                           [["user"
                                             [{:field-name "custom_id" :base-type :type/Integer :pk? true}]
                                             []]
                                            ["group"
                                             [{:field-name "id" :base-type {:native "INTEGER"} :pk? true}
                                              {:field-name "user_custom_id" :base-type :type/Integer :fk "user"}]
                                             []]])
          table-def (second (:table-definitions db-def))
          sql       (sql.tx/create-table-sql :sqlite db-def table-def)]
      (is (= ["CREATE TABLE \"group\" ("
              "  \"id\" INTEGER,"
              "  \"user_custom_id\" INTEGER,"
              "  PRIMARY KEY (\"id\"),"
              "  FOREIGN KEY (\"user_custom_id\") REFERENCES \"user\" (\"custom_id\")"
              ")"]
             (str/split-lines (driver/prettify-native-form :sqlite sql)))))))

(defmethod tx/destroy-db! :sqlite
  [_driver dbdef]
  (let [file (io/file (db-file-name dbdef))]
    (when (.exists file)
      (.delete file))))

(defmethod tx/dataset-already-loaded? :sqlite
  [driver dbdef]
  ;; check and make sure the first table in the dbdef has been created.
  (let [{:keys [table-name], :as _tabledef} (first (:table-definitions dbdef))]
    (sql-jdbc.execute/do-with-connection-with-options
     driver
     (sql-jdbc.conn/connection-details->spec driver (tx/dbdef->connection-details driver :db dbdef))
     {:write? false}
     (fn [^java.sql.Connection conn]
       (with-open [rset (.getTables (.getMetaData conn)
                                    #_catalog        nil
                                    #_schema-pattern nil
                                    #_table-pattern  table-name
                                    #_types          (into-array String ["TABLE"]))]
         ;; if the ResultSet returns anything we know the table is already loaded.
         (.next rset))))))
