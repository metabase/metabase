(ns metabase-enterprise.data-editing.test-util
  (:require
   [clojure.test :refer :all]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (clojure.lang IDeref)
   (java.io Closeable)))

(set! *warn-on-reflection* true)

(defn- create-test-table! [driver db table-name]
  (let [_     (driver/create-table! driver
                                    (mt/id)
                                    table-name
                                    {:id   (driver/upload-type->database-type driver :metabase.upload/auto-incrementing-int-pk)
                                     :name [:text]
                                     :song  [:text]}
                                    :primary-key [:id])
        table (sync/create-table! db
                                  {:name         table-name
                                   :schema       nil
                                   :display_name table-name})]
    (sync/sync-fields-for-table! db table)
    (:id table)))

(defn table-url
  "Returns the URL for data editing of the table with the given ID."
  [table-id]
  (format "ee/data-editing/table/%d" table-id))

(defn open-test-table!
  "Sets up an anonymous table in the appdb. Return a box that can be deref'd for the table-id.

  Returned box is java.io.Closeable so you can clean up with `with-open`.
  Otherwise .close the box to drop the table when finished."
  ^Closeable []
  (let [driver     :h2
        db         (t2/select-one :model/Database (mt/id))
        table-name (str "temp_table_" (u/lower-case-en (random-uuid)))
        cleanup    #(try (driver/drop-table! driver (mt/id) table-name) (catch Exception _))]
    (try
      (let [table-id (create-test-table! driver db table-name)]
        (reify Closeable
          IDeref
          (deref [_] table-id)
          (close [_] (cleanup))))
      (catch Exception e
        (cleanup)
        (throw e)))))

(defmacro with-temp-test-db!
  "Sets up a temporary database in the appdb to do destrcutive tests.

  Use (mt/id), (mt/db) etc to get the database id and database object."
  [& body]
  `(actions.tu/with-actions-test-data
     (t2/update! :model/Database (mt/id) {:settings {:database-enable-table-editing true}})
     ~@body))
