(ns metabase.driver.ddl.interface
  (:require [metabase.driver :as driver]))

(defmulti format-name
  "Transform a lowercase string Table or Field name in a way appropriate for this dataset (e.g., `h2` would want to
  upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`. This method should return a string.
  Defaults to an identity implementation."
  {:arglists '([driver table-or-field-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod format-name :default [_ table-or-field-name] table-or-field-name)

(defmulti field-base-type->sql-type (fn [driver base-type] [driver base-type]))

;; db_id, table def, table metadata, table_id
(defmulti persist!
  "Persist a model in a datastore. A table is created and populated in the source datastore, not the application
  database. Assumes that the destination schema is populated and permissions are correct. This should all be true
  if `(driver/database-supports engine :persisted-models database)` returns true."
  {:arglists '([driver database persisted-info card])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti unpersist!
  ""
  {:arglists '([driver database persisted-info])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)
