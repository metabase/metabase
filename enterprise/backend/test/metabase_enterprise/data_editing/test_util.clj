(ns metabase-enterprise.data-editing.test-util
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.actions.settings :as actions.settings]
   [metabase.actions.test-util :as actions.tu]
   [metabase.driver :as driver]
   [metabase.premium-features.token-check :as token-check]
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
                                      :display_name table-name
                                      :field_order  :database})]
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

(def ^:private ^:dynamic *initial-db-settings* nil)

(defn restore-db-settings-fixture [f]
  (binding [*initial-db-settings* {}]
    (try
      (f)
      (finally
        (when *initial-db-settings*
          (doseq [[id settings] *initial-db-settings*]
            (t2/update! :model/Database id {:settings settings})))))))

;; TODO: this is an anti pattern to modify the test db (mt/id)
;; it can mess up with other tests if we make desctructive changes, we should really just create a new db
(defn alter-db-settings! [f & args]
  (let [id           (mt/id)
        settings     (t2/select-one-fn :settings :model/Database id)
        ;; save initial settings so the restore-appdb-settings-fixture can restore them
        _            (when-some [db-settings *initial-db-settings*]
                       (set! *initial-db-settings* (if (contains? db-settings id)
                                                     db-settings
                                                     (assoc db-settings id settings))))
        new-settings (apply f settings args)]
    (t2/update! :model/Database id {:settings new-settings})))

(defn toggle-data-editing-enabled! [on-or-off]
  (alter-db-settings! assoc :database-enable-table-editing (boolean on-or-off)))

(defmacro with-data-editing-enabled! [on-or-off & body]
  `(let [before# (actions.settings/database-enable-table-editing)]
     (try
       (toggle-data-editing-enabled! ~on-or-off)
       (let [tokens# (cond-> (token-check/*token-features*)
                       ~on-or-off       (conj "table-data-editing")
                       (not ~on-or-off) (disj "table-data-editing"))]
         (binding [token-check/*token-features* (constantly tokens#)]
           ~@body))
       (finally
         (toggle-data-editing-enabled! before#)))))

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
  "Execute `body` with temporary table(s) created in the test database. You may specify multiple table specifications
  to create multiple tables. Each table specification should be a vector containing `[column-map create-table-opts]`.
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
     (toggle-data-editing-enabled! true)
     ~@body))
