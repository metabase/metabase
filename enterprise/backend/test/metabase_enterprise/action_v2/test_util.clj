(ns metabase-enterprise.action-v2.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def execute-bulk-url "/ee/action-v2/execute-bulk")

;; TODO make non-bulk versions, and DRY up  bit

(defn create-rows!
  ([table-id rows]
   (create-rows! table-id :crowberto 200 rows))
  ([table-id user response-code rows]
   (mt/user-http-request user :post response-code execute-bulk-url
                         {:action :data-grid.row/create
                          :scope  {:table-id table-id}
                          :inputs rows})))

(defn update-rows!
  ([table-id rows]
   (update-rows! table-id :crowberto 200 rows))
  ([table-id rows params]
   (update-rows! table-id :crowberto 200 rows params))
  ([table-id user response-code rows & [params]]
   (mt/user-http-request user :post response-code execute-bulk-url
                         (cond->
                          {:action :data-grid.row/update
                           :scope  {:table-id table-id}
                           :inputs rows}
                           params (assoc :params params)))))

(defn delete-rows!
  ([table-id rows]
   (delete-rows! table-id :crowberto 200 rows))
  ([table-id user response-code rows]
   (mt/user-http-request user :post response-code execute-bulk-url
                         {:action :data-grid.row/delete
                          :scope  {:table-id table-id}
                          :inputs rows})))

(defn sync-new-table!
  "Syncs a new table by name, returns the table id."
  [db table-name]
  (let [table (sync/create-table! db {:name table-name
                                      ;; todo figure out how to determine default schema from driver
                                      :schema (case (:engine db) :postgres "public" nil)
                                      :display_name table-name
                                      :field_order  :database
                                      :is_writable  true})]
    (sync/sync-fields-for-table! db table)
    (:id table)))

(defn- create-test-table! [db table-name column-map create-table-opts]
  (let [_  (driver/create-table! (:engine db)
                                 (:id db)
                                 table-name
                                 column-map
                                 create-table-opts)]
    (sync-new-table! db table-name)))

(defn toggle-data-editing-enabled! [db-id on-or-off]
  (let [current-settings (t2/select-one-fn :settings :model/Database db-id)]
    (t2/update! :model/Database db-id {:settings (assoc current-settings :database-enable-table-editing (boolean on-or-off))})))

(defmacro with-data-editing-enabled! [on-or-off & body]
  `(mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:database-enable-table-editing ~on-or-off}}
     ~@body))

(def default-test-table
  "The default test table config."
  [{:id    'auto-inc-type
    :name  [:text]
    :song  [:text]}
   {:primary-key [:id]}])

(defn do-with-test-tables!
  "Impl of [[with-test-tables!]]."
  [[column-map create-table-opts] thunk]
  (let [db            (t2/select-one :model/Database (mt/id))
        driver        (:engine db)
        auto-inc-type (driver/upload-type->database-type driver :metabase.upload/auto-incrementing-int-pk)
        column-map    (walk/postwalk-replace {'auto-inc-type auto-inc-type} column-map)
        table-name    (str "temp_table_" (str/replace (random-uuid) "-" "_"))
        cleanup       (fn []
                        (driver/drop-table! driver (mt/id) table-name)
                        (t2/delete! :model/Table :name table-name))]
    (try
      (thunk (create-test-table! db table-name column-map create-table-opts))
      (catch Exception e
        (try (cleanup) (catch Exception cleanup-ex (.addSuppressed e cleanup-ex)))
        (throw e)))))

(defmacro with-test-tables!
  "Execute `body` with temporary table(s) created in the test database that has actions and table editing enabled.
  You may specify multiple table specifications to create multiple tables.
  Each table specification should be a vector containing `[column-map create-table-opts]`.
  The symbol `auto-inc-type` can be used in column maps to denote the driver-specific auto-incrementing type for
  primary keys.

  Each table is created with a unique name and is automatically cleaned up after the body concludes. The body is
  executed within an empty database context (mt/with-empty-db).

  DOES NOT CREATE TABLES UNTIL THE BODY IS EXECUTED!

    ;; create a single table with default schema
    (with-test-tables! [table-id [{:id 'auto-inc-type, :name [:text], :song [:text]}
                                  {:primary-key [:id]}]]
      ...)

    ;; create multiple tables
    (with-test-tables! [users-table [{:id 'auto-inc-type, :name [:text]} {:primary-key [:id]}]
                        posts-table [{:id 'auto-inc-type, :user_id [:int], :content [:text]} {:primary-key [:id]}]]
      ...)"
  [[table-binding table-spec & more] & body]
  `(mt/with-empty-db
     (t2/update! :model/Database (mt/id) {:settings {:database-enable-table-editing true
                                                     :database-enable-actions       true}})
     (do-with-test-tables!
      ~table-spec
      (fn [~table-binding]
        ~@(if (seq more)
            [`(with-test-tables! ~(vec more) ~@body)]
            body)))))

(defmacro with-temp-test-db!
  "Sets up a temporary database in the appdb to do destrcutive tests.

  Use (mt/id), (mt/db) etc to get the database id and database object."
  [& body]
  `(actions.tu/with-actions-test-data
     (toggle-data-editing-enabled! (mt/id) true)
     ~@body))

(defmacro with-actions-temp-db
  "Like [[actions.tu/with-actions-temp-db]] but with table editing enabled"
  [dataset-definition & body]
  `(actions.tu/with-actions-temp-db ~dataset-definition
     (t2/update! :model/Database (mt/id) {:settings {:database-enable-table-editing true
                                                     :database-enable-actions       true}})
     ~@body))
