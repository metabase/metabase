(ns metabase.prototype.seed
  "Writes the prototype dataset into the `prototype_data` schema of the Postgres app DB."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.prototype.dataset :as dataset]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]))

(set! *warn-on-reflection* true)

(def ^:private version-comment-prefix "metabase-prototype-data version=")

(defn- qualified [table-name]
  (str dataset/schema-name "." table-name))

(defn- seeded-version
  "Version of the dataset in the app DB, or nil when there is none."
  [conn]
  (when-let [comment (:c (jdbc/execute-one! conn
                                            ["SELECT obj_description(oid, 'pg_namespace') AS c
                                              FROM pg_namespace WHERE nspname = ?" dataset/schema-name]
                                            {:builder-fn jdbc.rs/as-unqualified-lower-maps}))]
    (when (str/starts-with? comment version-comment-prefix)
      (parse-long (subs comment (count version-comment-prefix))))))

(defn- primary-key? [[_ _ semantic-type]]
  (= semantic-type :type/PK))

(defn- create-table-sql [{table-name :name, :keys [columns foreign-keys]}]
  (format "CREATE TABLE %s (%s)"
          (qualified table-name)
          (str/join ", " (for [[col-name pg-type :as column] columns
                               :let [target (get foreign-keys col-name)]]
                           (cond-> (str (name col-name) " " pg-type)
                             (primary-key? column) (str " PRIMARY KEY")
                             target                (str " REFERENCES " (qualified target) "(id)"))))))

(defn- insert-sql [{table-name :name, :keys [columns]}]
  (format "INSERT INTO %s (%s) VALUES (%s)"
          (qualified table-name)
          (str/join ", " (map (comp name first) columns))
          (str/join ", " (for [[_ pg-type] columns] (str "?::" pg-type)))))

(defn- create-schema! [conn]
  (jdbc/execute! conn [(format "DROP SCHEMA IF EXISTS %s CASCADE" dataset/schema-name)])
  (jdbc/execute! conn [(format "CREATE SCHEMA %s" dataset/schema-name)])
  (doseq [[type-name values] dataset/enum-types]
    (jdbc/execute! conn [(format "CREATE TYPE %s AS ENUM (%s)"
                                 (qualified type-name)
                                 (str/join ", " (map #(str "'" % "'") values)))]))
  (doseq [table dataset/tables]
    (jdbc/execute! conn [(create-table-sql table)])
    (jdbc/execute! conn [(format "COMMENT ON TABLE %s IS '%s'" (qualified (:name table)) (:description table))])))

(defn- insert-rows!
  "Insert the rows of `table` and return them, realized, when later tables need them. Otherwise return nil, so
  that big tables stream through without being held in memory."
  [conn {table-name :name, :keys [columns rows], :as table} context]
  (let [column-keys (mapv first columns)
        rows        (cond-> (rows context)
                      (contains? dataset/context-tables table-name) vec)]
    (with-open [ps (jdbc/prepare conn [(insert-sql table)])]
      (jdbc/execute-batch! ps (map (apply juxt column-keys) rows) {:batch-size 2000}))
    (log/infof "Prototype data: inserted %s" table-name)
    (when (vector? rows) rows)))

(defn- index-foreign-keys! [conn]
  (doseq [{table-name :name, :keys [foreign-keys]} dataset/tables
          col-name (keys foreign-keys)]
    (jdbc/execute! conn [(format "CREATE INDEX ON %s (%s)" (qualified table-name) (name col-name))])))

(defn- seed! [conn]
  (create-schema! conn)
  (reduce (fn [context table]
            (if-let [rows (insert-rows! conn table context)]
              (assoc context (keyword (:name table)) rows)
              context))
          {}
          dataset/tables)
  (index-foreign-keys! conn)
  (jdbc/execute! conn [(format "COMMENT ON SCHEMA %s IS '%s%d'"
                               dataset/schema-name version-comment-prefix dataset/version)]))

(defn ensure-seeded!
  "Seed the dataset when the app DB has no dataset or an older version of it. Return true when it seeded."
  []
  (with-open [conn (jdbc/get-connection (mdb/data-source))]
    (let [current (seeded-version conn)]
      (if (= current dataset/version)
        false
        (do
          (log/infof "Prototype data: seeding version %d (found %s). This takes about a minute."
                     dataset/version (or current "none"))
          (jdbc/with-transaction [tx conn]
            (seed! tx))
          (log/info "Prototype data: seeding done")
          true)))))
