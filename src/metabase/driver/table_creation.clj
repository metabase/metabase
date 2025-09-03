(ns metabase.driver.table-creation
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [metabase.driver :as driver]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::data-type
  [:enum :boolean :int :float :date :datetime :offset-datetime :text])

(mr/def ::column-definition
  [:map
   [:name :string]
   [:type ::data-type]
   [:nullable? {:optional true} :boolean]])

(mr/def ::table-definition
  [:map
   [:name :keyword]
   [:columns [:sequential ::column-definition]]
   [:primary-key {:optional true} [:sequential :string]]])

(defmulti data-type->database-type
  "Maps generic data types to driver-specific database types."
  {:arglists '([driver data-type])}
  (fn [driver & _] driver)
  :hierarchy #'driver/hierarchy)

(mu/defmethod data-type->database-type :default
  [driver :- :keyword
   data-type :- ::data-type]
  (let [upload-type (keyword "metabase.upload" (name data-type))]
    (driver/upload-type->database-type driver upload-type)))

(defmulti insert-from-source!
  "Inserts data from a data source into an existing table.
   This abstracts away the conversion and insertion process, allowing drivers
   to optimize based on the data source type.

   Args:
   - driver: The database driver keyword
   - database-id: Database ID
   - table-name: Name of the target table
   - column-names: Vector of column names in insertion order
   - data-source: Data source specification

   Returns:
   - Number of rows inserted"
  {:arglists '([driver database-id table-name column-names data-source])}
  (fn [_ _ _ _ data-source] (:type data-source)))

(defmulti data-source->rows
  "Converts a data source into a sequence of row vectors."
  {:arglists '([data-source])}
  :type)

(defmethod data-source->rows :rows
  [{:keys [data]}]
  data)

(defmethod data-source->rows :default
  [data-source]
  (throw (ex-info (format "Unsupported data source type: %s" (:type data-source))
                  {:data-source data-source})))

(mu/defmethod insert-from-source! :default
  [driver :- :keyword
   database-id :- pos-int?
   table-name :- :keyword
   column-names :- [:sequential :string]
   data-source]
  (let [rows (data-source->rows data-source)]
    (when (seq rows)
      (log/debugf "Inserting %d rows from %s source" (count rows) (:type data-source))
      (driver/insert-into! driver database-id table-name column-names rows))
    (count rows)))

(defmulti insert-from-csv!
  "Insert data from a csv file"
  {:arglists '([driver database-id table-name column-names csv-file])}
  (fn [driver & _] driver) :hierarchy #'driver/hierarchy)

;; default impl, e.g. postgres could issue `COPY`
(defmethod insert-from-csv! :default
  [driver db-id table-name column-names file]
  (let [csv-rows (csv/read-csv (io/reader file))
        data-rows (rest csv-rows)]
    (insert-from-source! driver db-id table-name column-names {:type :rows :data data-rows})))

(defmethod insert-from-source! :csv-file
  [driver db-id table-name column-names {:keys [file]}]
  (insert-from-csv! driver db-id table-name column-names file))

(mu/defn create-table-from-schema!
  "Create a table from a table-schema"
  [driver :- :keyword
   database-id :- pos-int?
   table-schema :- ::table-definition]
  (let [{:keys [columns] table-name :name} table-schema
        column-definitions (into {} (map (fn [{:keys [name type]}]
                                           [name (data-type->database-type driver type)]))
                                 columns)
        primary-key-opts (select-keys table-schema [:primary-key])]
    (log/infof "Creating table %s with %d columns" table-name (count columns))
    (driver/create-table! driver database-id table-name column-definitions primary-key-opts)))
