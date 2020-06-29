(ns metabase.test.data.impl.verify
  "Logic for verifying that test data was loaded correctly."
  (:require [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [models :refer [Table]]
             [query-processor :as qp]
             [util :as u]]
            [metabase.test.data.interface :as tx]
            [toucan.db :as db]))

(defmulti verify-data-loaded-correctly
  "Make sure a `DatabaseDefinition` (see `metabase.test.data.interface`) was loaded correctly. This checks that all
  defined Tables and Fields exist and the correct number of rows exist."
  {:arglists '([driver database-definition database])}
  tx/dispatch-on-driver-with-test-extensions
  :hierarchy #'driver/hierarchy)

(defn- loaded-tables
  "Actual Tables loaded into `database`. Returns a set of `[schema-name table-name]` pairs."
  [{:keys [driver database]}]
  (->> (driver/describe-database driver database)
       :tables
       (map (juxt :schema :name))
       set))

(defn- loaded-fields
  "Actual Fields loaded into a Table. Returns set of field names."
  [{:keys [driver database actual-schema actual-table-name]}]
  (->> (driver/describe-table driver database {:schema actual-schema, :name actual-table-name})
       :fields
       (map :name)
       set))

(defn- format-name
  "Format an identifier e.g. Database or Table name for `driver`."
  [driver a-name]
  (binding [driver/*driver* driver]
    ((requiring-resolve 'metabase.test.data/format-name) a-name)))

(defn- params->ex-data
  "Remove the actual definitions from `params` so Exceptions aren't too noisy."
  [{:keys [database-definition table-definition field-definition], :as params}]
  (-> params
      (dissoc :database-definition :table-definition :field-definition)
      (assoc :original-database-name (:database-name database-definition)
             :original-table-name    (:table-name table-definition)
             :original-field-name    (:field-name field-definition))))

(defn- verify-field
  "Make sure the Field defined by a FieldDefinition exists."
  [{:keys                [driver actual-table-name actual-field-names]
    {:keys [field-name]} :field-definition
    :as                  params}]
  (let [field-name (format-name driver field-name)]
    (log/debugf "Checking whether Field %s.%s was loaded correctly..." (pr-str actual-table-name) (pr-str field-name))
    (when-not (contains? actual-field-names field-name)
      (throw (ex-info (format "Error loading data: Field %s.%s does not exist after sync"
                              (pr-str actual-table-name) (pr-str field-name))
                      (params->ex-data params))))
    (log/debugf "Found Field %s.%s" (pr-str actual-table-name) (pr-str field-name))))

(defn- verify-table
  "Make sure the Table defined by a TableDefinition was loaded correctly (check that it exist and all the correct Fields
  exist)."
  [{:keys                                       [driver database actual-tables]
    {:keys [table-name field-definitions rows]} :table-definition
    :as                                         params}]
  (log/debugf "Checking whether Table %s was loaded correctly..." (pr-str table-name))
  (let [table-name                  (format-name driver table-name)
        qualified-table-name        (tx/db-qualified-table-name (:name database) table-name)
        [actual-schema actual-name] (or (some (fn [[_ a-name :as schema+table]]
                                                (when (or (= a-name table-name)
                                                          (= a-name qualified-table-name))
                                                  schema+table))
                                              actual-tables)
                                        (throw (ex-info (format "Error loading data: Table %s does not exist after sync"
                                                                (pr-str table-name))
                                                        (params->ex-data params))))]
    (log/debugf "Found Table %s.%s" (pr-str actual-schema) (pr-str actual-name))
    (let [params (assoc params :actual-schema actual-schema, :actual-table-name actual-name)
          params (assoc params :actual-field-names (loaded-fields params))]
      (log/debugf "Verifying fields...")
      (doseq [fielddef field-definitions
              :let     [params (assoc params :field-definition fielddef)]]
        (try
          (verify-field params)
          (catch Throwable e
            (throw (ex-info "Error verifying Field." (params->ex-data params) e)))))
      (log/debugf "All Fields for Table %s.%s loaded correctly." (pr-str actual-schema) (pr-str actual-name))
      (log/debugf "Verifying rows...")
      (let [table-id           (or (db/select-one-id Table :db_id (u/get-id database), :name actual-name)
                                   (throw (ex-info (format "Cannot find %s.%s after sync." (pr-str actual-schema) (pr-str actual-name))
                                                   (params->ex-data params))))
            expected-row-count (count rows)
            actual-row-count   (-> (qp/process-query {:database (u/get-id database)
                                                      :type     :query
                                                      :query    {:source-table table-id
                                                                 :aggregation  [[:count]]}})
                                   :data
                                   :rows
                                   ffirst
                                   int)]
        (log/debugf "Expected rows: %d. Actual rows: %d" expected-row-count actual-row-count)
        (when-not (= expected-row-count actual-row-count)
          (throw (ex-info (format "Incorrect number of rows loaded for Table %s.%s. Expected: %d. Actual: %d"
                                  (pr-str actual-schema) (pr-str actual-name)
                                  expected-row-count actual-row-count)
                          (params->ex-data params))))
        (log/debugf "Table %s.%s loaded correctly." (pr-str actual-schema) (pr-str actual-name))))))

(defmethod verify-data-loaded-correctly :default
  [driver {:keys [table-definitions database-name], :as dbdef} database]
  (log/debugf "Verifying data for Database %s loaded correctly..." (pr-str database-name))
  (let [params        {:driver              driver
                       :database-definition dbdef
                       :database            database}
        actual-tables (loaded-tables params)]
    (doseq [tabledef table-definitions
            :let     [params (assoc params :actual-tables actual-tables, :table-definition tabledef)]]
      (try
        (verify-table params)
        (catch Throwable e
          (throw (ex-info "Error verifying Table." (params->ex-data params) e))))))
  (log/debugf "All Tables for Database %s loaded correctly." (pr-str database-name)))
