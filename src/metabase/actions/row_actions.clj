(ns metabase.actions.row-actions
  "The row actions, `:model.row/*` and `:table.row/*`, on top of the row-level driver API:
  [[driver/action-create-row!]], [[driver/action-update-row!]] and [[driver/action-delete-row!]].

  Nothing here depends on the kind of database. Each input is one row, and the driver is called once per row. A call
  with more than one input needs the driver to support `:actions/bulk`. The rows run one after another: a
  `:model.row/*` action stops at the first error, and a `:table.row/*` action collects the error of each row. A driver
  that can make the batch atomic does so by wrapping these methods (see `metabase.driver.sql-jdbc.actions`)."
  (:require
   [clojure.string :as str]
   [flatland.ordered.set :as ordered-set]
   [metabase.actions.actions :as actions]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Primary keys                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- table-id->pk-field-name->id :- [:map-of :string ::lib.schema.id/field]
  "A map of the name of each primary key column of the Table with `table-id` to its Field ID."
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (actions/cached-value
   [::table-id->pk-field-name->id table-id]
   (fn []
     (let [mp (lib-be/application-database-metadata-provider database-id)]
       (into {}
             (comp (filter #(isa? (:semantic-type %) :type/PK))
                   (map (juxt :name :id)))
             (lib.metadata/fields mp table-id))))))

(defn- assert-pk!
  "Throw a 400 unless the Table with `table-id` has at least one primary key column."
  [database-id table-id]
  (when (empty? (table-id->pk-field-name->id database-id table-id))
    (throw (ex-info (tru "Cannot edit a table without it having at least one entity key configured.")
                    {:type        :data-editing/no-pk
                     :status-code 400
                     :table-id    table-id}))))

(defn- pk-names
  [database-id table-id]
  (set (keys (table-id->pk-field-name->id database-id table-id))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Input checks                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- assert-delete-friendly-row-keys
  "Checks two conditions on the rows we intend to delete:
  - All `rows` have the same set of keys, and
  - That set is exactly the `expected-columns`, which should be only the PK column(s) of the table.

  Otherwise, an appropriate 400 response is returned."
  [rows expected-columns]
  (let [all-colsets (into #{} (map #(set (keys %)))
                          rows)]
    (cond
      (> (count all-colsets) 1)
      (throw (ex-info (tru "Some rows have different sets of columns: {0}"
                           (str/join ", " (map pr-str all-colsets)))
                      {:status-code 400
                       :column-sets all-colsets}))

      (not= (set expected-columns) (first all-colsets))
      (throw (ex-info (tru "Rows have the wrong columns: expected {0}, but got {1}"
                           expected-columns
                           (first all-colsets))
                      {:status-code      400
                       :expected-columns expected-columns
                       :actual-columns   (first all-colsets)})))))

(defn- assert-unique-delete-rows
  "Make sure all `rows` are unique, or return a 400 response.

  It makes no sense to try to delete the same row twice, and it will fail because the second call will find zero rows
  to delete."
  [rows]
  (when-let [repeats (->> (frequencies rows)
                          ;; ordered set so the results are deterministic for test purposes
                          (into (ordered-set/ordered-set)
                                (filter (fn [[_row repeat-count]]
                                          (> repeat-count 1))))
                          not-empty)]
    (throw (ex-info (tru "Rows need to be unique: repeated rows {0}"
                         (str/join ", " (for [[row repeat-count] repeats]
                                          (format "%s × %d" (pr-str row) repeat-count))))
                    {:status-code   400
                     :repeated-rows repeats}))))

(defn- assert-all-pk-columns
  "Return a 400 if `row` doesn't have all the required PK columns."
  [row pk-names]
  (doseq [pk-key pk-names
          :when  (not (contains? row pk-key))]
    (throw (ex-info (tru "Row is missing required primary key column. Required {0}; got {1}"
                         (pr-str (sort pk-names))
                         (pr-str (sort (keys row))))
                    {:row         row
                     :pk-names    pk-names
                     :status-code 400}))))

(defn- assert-contains-update-columns
  "Return a 400 if `row` doesn't have any non-PK columns to update."
  [row pk-names]
  (when (empty? (remove pk-names (keys row)))
    (throw (ex-info (tru "Invalid update row map: no non-PK columns. Got {0}, all of which are PKs."
                         (pr-str (set (keys row))))
                    {:status-code 400
                     :row         row
                     :all-keys    (set (keys row))
                     :pk-names    pk-names}))))

(defn- assert-pk-columns!
  "Return a 400 unless the `pk` of a `:model.row/update` or `:model.row/delete` input has a value for exactly the
  primary key columns `pk-names`."
  [pk pk-names]
  (when (not= (set (keys pk)) pk-names)
    (throw (ex-info (tru "The primary key must have a value for each primary key column {0}, and nothing else; got {1}"
                         (pr-str (sort pk-names))
                         (pr-str (sort (keys pk))))
                    {:status-code 400
                     :pk          pk
                     :pk-names    pk-names}))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Databases                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- single-database
  "The one Database with an ID in `database-ids`. Throws a 400 when there is more than one."
  [database-ids]
  (let [database-ids (set database-ids)]
    (when-not (= 1 (count database-ids))
      (throw (ex-info (tru "Cannot operate on multiple databases, it would not be atomic.")
                      {:status-code  400
                       :database-ids database-ids})))
    (actions/cached-database (first database-ids))))

(defn- assert-driver-has-row-methods!
  "Throw a 400 unless the driver of `database` implements the row-level driver API, as [[actions/perform-action!*]]
  does for an action no driver implements."
  [action database]
  (let [driver (:engine database)]
    (when-not (and (get-method driver/action-create-row! driver)
                   (get-method driver/action-update-row! driver)
                   (get-method driver/action-delete-row! driver))
      (throw (ex-info (tru "Action {0} is not supported for {1} Databases."
                           action
                           (pr-str driver))
                      {:status-code 400})))))

(defn- assert-bulk-supported
  "Throw a 400 if `inputs` holds more than one row and the driver of `database` does not support `:actions/bulk`."
  [action database inputs]
  (when (and (next inputs)
             (not (driver.u/supports? (:engine database) :actions/bulk database)))
    (throw (ex-info (tru "{0} can only act on one row at a time for this database, but got {1}."
                         (u/qualified-name action)
                         (count inputs))
                    {:status-code 400
                     :action      action
                     :rows        (count inputs)}))))

(defn- row-action-database
  "The one Database that all of `inputs` act on, after checking that its driver can perform `action` on them.
  `input->database-id` is the Database ID of an input."
  [action inputs input->database-id]
  (let [database (single-database (map input->database-id inputs))]
    (assert-driver-has-row-methods! action database)
    (assert-bulk-supported action database inputs)
    database))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  One row                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; Each of these acts on one row, and returns what changed as the diff of an `:effect/row.modified`.

(defn- create-row!
  "Insert `row` into the Table with `table-id`. The Table needs a primary key, so that the driver can find the row it
  inserted."
  [database table-id row]
  (let [database-id (u/the-id database)]
    (assert-pk! database-id table-id)
    {:table-id table-id
     :db-id    database-id
     :before   nil
     :after    (driver/action-create-row! (:engine database) database
                                          {:table-id   table-id
                                           :pk-columns (vec (sort (pk-names database-id table-id)))
                                           :row        row})}))

(defn- update-row!
  "Set the columns in `row` on the row of the Table with `table-id` whose primary key is `pk`."
  [database table-id pk row]
  (let [{:keys [before after]} (driver/action-update-row! (:engine database) database
                                                          {:table-id table-id
                                                           :pk       pk
                                                           :row      row})]
    {:table-id table-id
     :db-id    (u/the-id database)
     :before   before
     :after    after}))

(defn- delete-row!
  "Delete the row of the Table with `table-id` whose primary key is `pk`."
  [database table-id pk]
  (let [{:keys [before]} (driver/action-delete-row! (:engine database) database
                                                    {:table-id table-id
                                                     :pk       pk})]
    {:table-id table-id
     :db-id    (u/the-id database)
     :before   before
     :after    nil}))

(defn- record-mutations
  "Update the context to append the modifications made by the action."
  [context diffs]
  (update context :effects
          (fnil into [])
          (map #(vector :effect/row.modified %))
          diffs))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                `:model.row/*`                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- assert-model-row-pk!
  "Throw a 400 unless the Table of a `:model.row/update` or `:model.row/delete` `input` has a primary key, and the
  input's `:pk` has a value for exactly its primary key columns."
  [{database-id :database, :keys [table-id pk]}]
  (assert-pk! database-id table-id)
  (assert-pk-columns! pk (pk-names database-id table-id)))

(methodical/defmethod actions/perform-action!* [::driver/driver :model.row/create]
  [action context inputs]
  (let [database (row-action-database action inputs :database)
        diffs    (mapv (fn [{:keys [table-id create-row]}]
                         (create-row! database table-id create-row))
                       inputs)]
    {:context (record-mutations context diffs)
     :outputs (mapv (fn [{:keys [after]}]
                      {:created-row after})
                    diffs)}))

(methodical/defmethod actions/perform-action!* [::driver/driver :model.row/update]
  [action context inputs]
  (let [database (row-action-database action inputs :database)
        diffs    (mapv (fn [{:keys [table-id pk update-row] :as input}]
                         (assert-model-row-pk! input)
                         (update-row! database table-id pk update-row))
                       inputs)]
    {:context (record-mutations context diffs)
     :outputs [{:rows-updated (count diffs)}]}))

(methodical/defmethod actions/perform-action!* [::driver/driver :model.row/delete]
  [action context inputs]
  (let [database (row-action-database action inputs :database)
        diffs    (mapv (fn [{:keys [table-id pk] :as input}]
                         (assert-model-row-pk! input)
                         (delete-row! database table-id pk))
                       inputs)]
    {:context (record-mutations context diffs)
     :outputs [{:rows-deleted (count diffs)}]}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                `:table.row/*`                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table-input->database-id
  [{:keys [table-id]}]
  (u/the-id (actions/cached-database-via-table-id table-id)))

(defn- run-rows
  "Call `f` on each of `rows` in turn, and return `[errors diffs]`: the `{:index :exception}` of each row that threw,
  and what `f` returned for the others."
  [f rows]
  (loop [i            0
         [row & tail] rows
         errors       (transient [])
         diffs        (transient [])]
    (if (nil? row)
      [(persistent! errors) (persistent! diffs)]
      ;; `recur` can't be inside the `try`, so it says which of the two vectors this row goes in
      (let [[error diff] (try
                           [nil (f row)]
                           (catch Throwable e
                             [{:index     i
                               :exception e}
                              nil]))]
        (if error
          (recur (inc i) tail (conj! errors error) diffs)
          (recur (inc i) tail errors (conj! diffs diff)))))))

(defn- run-table-rows!
  "Call `(f table-id row)` on each row in `table-id->rows`, and return the diffs. If any row throws, log each error and
  throw a 400 with `error-message`, which lists the errors by the index of the row in `table-id->rows`."
  [error-message table-id->rows f]
  (let [rows           (for [[table-id rows] table-id->rows
                             row             rows]
                         [table-id row])
        [errors diffs] (run-rows (fn [[table-id row]]
                                   (f table-id row))
                                 rows)]
    (doseq [{:keys [exception]} errors]
      (log/error (ex-message exception)))
    (when (seq errors)
      (throw (ex-info error-message
                      {:status-code 400
                       :errors      (mapv (fn [{:keys [index exception]}]
                                            (merge {:index index
                                                    :error (ex-message exception)}
                                                   (ex-data exception)))
                                          errors)
                       :results     diffs})))
    diffs))

(methodical/defmethod actions/perform-action!* [::driver/driver :table.row/create]
  [action context inputs]
  (let [database       (row-action-database action inputs table-input->database-id)
        table-id->rows (u/group-by :table-id :row inputs)
        diffs          (run-table-rows! (tru "Error(s) inserting rows.")
                                        table-id->rows
                                        (fn [table-id row]
                                          (create-row! database table-id row)))]
    {:context (record-mutations context diffs)
     :outputs (mapv (fn [{:keys [table-id after]}]
                      {:table-id table-id
                       :op       :created
                       :row      after})
                    diffs)}))

(methodical/defmethod actions/perform-action!* [::driver/driver :table.row/update]
  [action context inputs]
  (let [database       (row-action-database action inputs table-input->database-id)
        database-id    (u/the-id database)
        table-id->rows (u/group-by :table-id :row inputs)]
    (doseq [[table-id rows] table-id->rows
            :let            [pk-names (pk-names database-id table-id)]]
      (assert-pk! database-id table-id)
      (doseq [row rows]
        (assert-all-pk-columns row pk-names)
        (assert-contains-update-columns row pk-names)))
    (let [diffs (run-table-rows! (tru "Error(s) updating rows.")
                                 table-id->rows
                                 (fn [table-id row]
                                   (let [pk-names (pk-names database-id table-id)]
                                     (update-row! database
                                                  table-id
                                                  (select-keys row pk-names)
                                                  (apply dissoc row pk-names)))))]
      {:context (record-mutations context diffs)
       :outputs (mapv (fn [{:keys [table-id after]}]
                        {:table-id table-id
                         :op       :updated
                         :row      after})
                      diffs)})))

(methodical/defmethod actions/perform-action!* [::driver/driver :table.row/delete]
  [action context inputs]
  (let [database       (row-action-database action inputs table-input->database-id)
        database-id    (u/the-id database)
        table-id->rows (u/group-by :table-id :row inputs)]
    (doseq [[table-id rows] table-id->rows]
      (assert-pk! database-id table-id)
      (assert-delete-friendly-row-keys rows (pk-names database-id table-id))
      (assert-unique-delete-rows rows))
    (let [diffs (run-table-rows! (tru "Error(s) deleting rows.")
                                 table-id->rows
                                 (fn [table-id row]
                                   (delete-row! database table-id row)))]
      {:context (record-mutations context diffs)
       :outputs (mapv (fn [{:keys [table-id before]}]
                        {:table-id table-id
                         :op       :deleted
                         :row      (select-keys before (pk-names database-id table-id))})
                      diffs)})))
