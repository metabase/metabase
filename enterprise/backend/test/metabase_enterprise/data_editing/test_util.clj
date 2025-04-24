(ns metabase-enterprise.data-editing.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable)))

(set! *warn-on-reflection* true)

(defn sync-new-table!
  "Syncs a new table by name, returns the table id."
  [db table-name]
  (let [table (sync/create-table! db {:name table-name
                                      ;; todo figure out how to determine default schema from driver
                                      :schema (case (:engine db) :postgres "public" nil)
                                      :display_name table-name})]
    (sync/sync-fields-for-table! db table)
    (:id table)))

(defn- create-test-table! [db table-name column-map create-table-opts]
  (let [_  (driver/create-table! (:engine db)
                                 (:id db)
                                 table-name
                                 column-map
                                 create-table-opts)]
    (sync-new-table! db table-name)))

(defn table-url
  "Returns the URL for data editing of the table with the given ID."
  [table-id]
  (format "ee/data-editing/table/%d" table-id))

(defn webhook-ingest-url
  "Returns the URL for the webhook ingest endpoint."
  [token]
  (format "ee/data-editing-public/webhook/%s/data" token))

(defn alter-appdb-settings! [f & args]
  (let [id           (mt/id)
        settings     (t2/select-one-fn :settings :model/Database id)
        new-settings (apply f settings args)]
    (t2/update! :model/Database id {:settings new-settings})))

(defn toggle-data-editing-enabled! [on-or-off]
  (alter-appdb-settings! assoc :database-enable-table-editing (boolean on-or-off)))

(defn open-test-table!
  "Sets up an anonymous table in the test db (mt/id). Return a box that can be deref'd for the table-id.

  Optionally accepts the column map and opts inputs to driver/create-table!.
  The symbol auto-inc-type can be used to denote the driver-specific auto-incrementing type for primary keys.
  e.g (open-test-table {:id 'auto-inc-type, :name [:text]} {:primary-key [:id]})

  Returned box is java.io.Closeable so you can clean up with `with-open`.
  Otherwise .close the box to drop the table when finished."
  (^Closeable []
   (open-test-table!
    {:id    'auto-inc-type
     :name  [:text]
     :song  [:text]}
    {:primary-key [:id]}))
  (^Closeable [column-map create-table-opts]
   (let [db            (t2/select-one :model/Database (mt/id))
         driver        (:engine db)
         auto-inc-type (driver/upload-type->database-type driver :metabase.upload/auto-incrementing-int-pk)
         column-map    (walk/postwalk-replace {'auto-inc-type auto-inc-type} column-map)
         table-name    (str "temp_table_" (str/replace (random-uuid) "-" "_"))
         cleanup       (fn []
                         (driver/drop-table! driver (mt/id) table-name)
                         (t2/delete! :model/Table :name table-name))]
     (try
       (let [table-id (create-test-table! db table-name column-map create-table-opts)]
         (reify Closeable
           IDeref
           (deref [_] table-id)
           (close [_] (cleanup))))
       (catch Exception e
         (try (cleanup) (catch Exception cleanup-ex (.addSuppressed e cleanup-ex)))
         (throw e))))))

(defmacro with-temp-test-db!
  "Sets up a temporary database in the appdb to do destrcutive tests.

  Use (mt/id), (mt/db) etc to get the database id and database object."
  [& body]
  `(actions.tu/with-actions-test-data
     (toggle-data-editing-enabled! true)
     ~@body))
