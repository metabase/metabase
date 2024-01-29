(ns metabase.driver.ddl.interface
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu])
  (:import
   (java.time Instant)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(mu/defn schema-name :- ::lib.schema.common/non-blank-string
  "Returns a schema name for persisting models. Needs the database to use the db id and the site-uuid to ensure that
  multiple connections from multiple metabases remain distinct. The UUID will have the first character of each section taken.

  (schema-name {:id 234} \"143dd8ce-e116-4c7f-8d6d-32e99eaefbbc\") ->  \"metabase_cache_1e483_1\""
  [{:keys [id] :as _database} :- [:map [:id ::lib.schema.id/database]]
   site-uuid-string           :- ::lib.schema.common/non-blank-string]
  (let [instance-string (apply str (map first (str/split site-uuid-string #"-")))]
    (format "metabase_cache_%s_%s" instance-string id)))

(defmulti format-name
  "Transform a lowercase string Table or Field name in a way appropriate for this dataset (e.g., `h2` would want to
  upcase these names; `mongo` would want to use `\"_id\"` in place of `\"id\"`. This method should return a string.
  Defaults to an identity implementation.

  This is actually ultimately used to format any name that comes back
  from [[metabase.test.data.sql/qualified-name-components]] -- so if you include the Database name there, it will get
  formatted by this as well."
  {:changelog-test/ignore true :added "0.44.0" :arglists '([driver table-or-field-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod format-name :default [_ table-or-field-name] table-or-field-name)

(defmulti check-can-persist
  "Verify that the source database is acceptable to persist. Returns a tuple of a boolean and `:persist.check/valid` in
  the event it was successful or a keyword indicating the reason for failure.

  Examples:
  - [true  :persist.check/valid]
  - [false :persist.check/create-schema]
  - [false :persist.check/create-table]
  - [false :persist.check/read-table]
  - [false :persist.check/delete-table]"
  {:changelog-test/ignore true :added "0.44.0" :arglists '([database])}
  (fn [database] (driver/dispatch-on-initialized-driver (:engine database)))
  :hierarchy #'driver/hierarchy)

(defn create-kv-table-honey-sql-form
  "The honeysql form that creates the persisted schema `cache_info` table."
  [schema-name]
  {:create-table [(keyword schema-name "cache_info") :if-not-exists]
   :with-columns [[:key :text] [:value :text]]})

(defn kv-table-values
  "Version 1 of the values to go in the key/value table `cache_info` table."
  []
  [{:key   "settings-version"
    :value "1"}
   {:key   "created-at"
    ;; "2023-03-29T14:01:27.871697Z"
    :value (.format DateTimeFormatter/ISO_INSTANT (Instant/now))}
   {:key   "instance-uuid"
    :value (public-settings/site-uuid)}
   {:key   "instance-name"
    :value (public-settings/site-name)}])

(defn populate-kv-table-honey-sql-form
  "The honeysql form that populates the persisted schema `cache_info` table."
  [schema-name]
  {:insert-into [(keyword schema-name "cache_info")]
   :values (kv-table-values)})

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
  {:changelog-test/ignore true :added "0.44.0" :arglists '([driver database definition dataset-query])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmulti unpersist!
  "Unpersist a persisted model. Responsible for removing the persisted table."
  {:changelog-test/ignore true :added "0.44.0" :arglists '([driver database persisted-info])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)
