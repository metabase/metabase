(ns metabase.driver.ddl.interface
  (:require [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.util.i18n :refer [tru]]))

(defn schema-name
  "Returns a schema name for persisting models. Needs the database to use the db id and the site-uuid to ensure that
  multiple connections from multiple metabae remain distinct. The UUID will have the first character of each section taken.

  (schema-name {:id 234} \"143dd8ce-e116-4c7f-8d6d-32e99eaefbbc\") ->  \"metabase_cache_1e483_1\""
  [{:keys [id] :as _database} site-uuid-string]
  (let [instance-string (apply str (map first (str/split site-uuid-string #"-")))]
    (format "metabase_cache_%s_%s" instance-string id)))

(defmulti format-name
  "Transform a lowercase string Table or Field name in a way appropriate for this dataset (e.g., `h2` would want to
  upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`. This method should return a string.
  Defaults to an identity implementation."
  {:arglists '([driver table-or-field-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod format-name :default [_ table-or-field-name] table-or-field-name)

(defmulti field-base-type->sql-type
  "A suitable db type for a base-type per database."
  {:arglists '([driver base-type])}
  (fn [driver base-type]
    [(driver/dispatch-on-initialized-driver driver) (keyword base-type)])
  :hierarchy #'driver/hierarchy)

(defmulti check-can-persist
  "Verify that the source database is acceptable to persist. Returns a tuple of a boolean and `:persist.check/valid` in
  the event it was successful or a keyword indicating the reason for failure.

  Examples:
  - [true  :persist.check/valid]
  - [false :persist.check/create-schema]
  - [false :persist.check/create-table]
  - [false :persist.check/read-table]
  - [false :persist.check/delete-table]"
  {:arglists '([database])}
  (fn [database] (driver/dispatch-on-initialized-driver (:engine database)))
  :hierarchy #'driver/hierarchy)

(defn error->message
  "Human readable messages for different connection errors."
  [error schema]
  (case error
    :persist.check/create-schema (tru "Lack permissions to create {0} schema" schema)
    :persist.check/create-table (tru "Lack permission to create table in schema {0}" schema)
    :persist.check/read-table (tru "Lack permission to read table in schema {0}" schema)
    :persist.check/delete-table (tru "Lack permission to delete table in schema {0}" schema)))

(defmulti refresh!
  "Refresh a model in a datastore. A table is created and populated in the source datastore, not the application
  database. Assumes that the destination schema is populated and permissions are correct. This should all be true
  if `(driver/database-supports engine :persisted-models database)` returns true. Returns a map with :state that
  is :success or :error. If :state is :error, includes a key :error with a string message."
  {:arglists '([driver database definition dataset-query])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti unpersist!
  "Unpersist a persisted model. Responsible for removing the persisted table."
  {:arglists '([driver database persisted-info])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)
