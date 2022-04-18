(ns metabase.driver.ddl.interface
  (:require [clojure.string :as str]
            [metabase.driver :as driver]
            [metabase.models.persisted-info :refer [PersistedInfo]]
            [metabase.models.persisted-info :as persisted-info]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn schema-name
  "Returns a schema name for persisting models. Needs the database to use the db id and the site-uuid to ensure that
  multiple connections from multiple metabae remain distinct. The UUID will have the first character of each section taken.

  (schema-name {:id 234} \"143dd8ce-e116-4c7f-8d6d-32e99eaefbbc\") ->  \"metabase_cache_1e483_1\""
  [{:keys [id] :as _database} uuid-string]
  (let [instance-string (apply str (map first (str/split uuid-string #"-")))]
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
  (fn [driver base-type] [driver base-type])
  :hierarchy #'driver/hierarchy)

(defmulti check-can-persist
  "Verify that the source database is acceptable to persist. Returns a tuple"
  {:arglists '([database])}
  (fn [database] (:engine database))
  :hierarchy #'driver/hierarchy)

(defn error->message
  "Human readable messages for different connection errors."
  [error schema]
  (case error
    :persist.check/create-schema (tru "Lack permissions to create {0} schema" schema)
    :persist.check/create-table (tru "Lack permission to create table in schema {0}" schema)
    :persist.check/read-table (tru "Lack permission to read table in schema {0}" schema)
    :persist.check/delete-table (tru "Lack permission to delete table in schema {0}" schema)))

;; db_id, table def, table metadata, table_id
(defmulti persist!*
  "Persist a model in a datastore. A table is created and populated in the source datastore, not the application
  database. Assumes that the destination schema is populated and permissions are correct. This should all be true
  if `(driver/database-supports engine :persisted-models database)` returns true."
  {:arglists '([driver database persisted-info card])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn persist!
  "Public API for persistence. Handles state transition of the persisted-info"
  [driver database user-id card]
  (let [slug (-> card :name persisted-info/slug-name)
        {:keys [dataset_query result_metadata database_id]} card
        card-id (u/the-id card)
        persisted-info (db/insert! PersistedInfo {:card_id       card-id
                                                  :database_id   database_id
                                                  :question_slug slug
                                                  :query_hash    (persisted-info/query-hash dataset_query)
                                                  :table_name    (format "model_%s_%s" card-id slug)
                                                  :columns       (mapv :name result_metadata)
                                                  :active        false
                                                  :refresh_begin :%now
                                                  :refresh_end   nil
                                                  :state         "creating"
                                                  :creator_id    user-id})
        {:keys [state] :as results} (persist!* driver database persisted-info card)]
    (if (= state :success)
      (db/update! PersistedInfo (u/the-id persisted-info)
        :active true, :refresh_end :%now :state "persisted")
      (db/update! PersistedInfo (u/the-id persisted-info)
        :refresh_end :%now :state "error", :error (:error results)))
    ;; todo: some new table to store refresh/create runs
    results))

(defmulti refresh!*
  "Refresh a model in a datastore. A table is created and populated in the source datastore, not the application
  database. Assumes that the destination schema is populated and permissions are correct. This should all be true
  if `(driver/database-supports engine :persisted-models database)` returns true."
  {:arglists '([driver database persisted-info])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn refresh!
  "Public API to refresh a persisted model. Handles state transitions of the persisted-info record. Returns ???"
  [driver database persisted-info]
  (db/update! PersistedInfo (u/the-id persisted-info)
    :active false, :refresh_begin :%now, :refresh_end nil, :state "refreshing")
  (let [{:keys [state] :as results} (refresh!* driver database persisted-info)]
    (if (= state :success)
      (db/update! PersistedInfo (u/the-id persisted-info)
        :active true, :refresh_end :%now, :state "persisted"
        :columns (->> results :args :definition :field-definitions (map :field-name))
        :error nil)
      (db/update! PersistedInfo (u/the-id persisted-info)
        :refresh_end :%now :state "error", :error (:error results)))))

(defmulti unpersist!
  "Unpersist a persisted model. Will delete the persisted info after removing the persisted table."
  {:arglists '([driver database persisted-info])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)
