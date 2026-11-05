(ns metabase.change-log.cascade
  "The rows of logged tables that the database itself changes when a row is deleted, through foreign keys from logged
  tables. No model hook sees those writes. The foreign keys are the imported keys of the logged tables in the app DB's
  JDBC metadata, read once per process, app DB and set of logged models. A logged model counts only once its namespace
  has loaded (`metabase.change-log.core`, \"To log a model\", step 2)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.change-log.db :as change-log.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn logged-models
  "The logged models, by table name. A keyword that derives from a logged model but is not a model, such as
  `:metadata/card`, is left out."
  []
  (into {}
        (for [model (descendants :hook/change-log)
              :when (= "model" (namespace model))]
          [(name (t2/table-name model)) model])))

(def ^:private foreign-keys*
  (mdb/memoize-for-application-db change-log.db/foreign-keys))

(defn foreign-keys
  "The [[change-log.db/foreign-keys]] from the tables of the [[logged-models]]."
  []
  (foreign-keys* (update-vals (logged-models) #(first (t2/primary-keys %)))))

(defn referenced-columns
  "The columns of `table-name` that `fks`, the [[foreign-keys]], reference."
  [fks table-name]
  (distinct (map :parent-column (get fks table-name))))

(defn changes
  "The `[table-name row-ids action]` of the rows of logged tables that deleting `rows` of `table-name` changes through
  `fks`, the [[foreign-keys]]: `delete` for the rows it cascades to, at any depth through logged tables, and `update`
  for the rows it sets a column of to NULL. `rows` must hold the [[referenced-columns]] of `table-name`, or nothing is
  found."
  [fks table-name rows]
  ;; `found` is `{[table action] #{row-id}}`. A row already found is not followed again, so a cycle ends.
  (loop [queue [[table-name rows]], found {}]
    (if-let [[[table rows] & queue] (seq queue)]
      (let [children (for [{:keys [child child-pk column parent-column rule]} (get fks table)
                           :let  [values (distinct (keep parent-column rows))
                                  action (if (= :cascade rule) "delete" "update")]
                           :when (seq values)
                           :let  [rows (remove #(contains? (found [child action]) (child-pk %))
                                               (change-log.db/rows-where
                                                child column values
                                                (cons child-pk (referenced-columns fks child))))]
                           :when (seq rows)]
                       [child child-pk action rows])]
        (recur (into (vec queue) (for [[child _ action rows] children :when (= "delete" action)] [child rows]))
               (reduce (fn [found [child child-pk action rows]]
                         (update found [child action] (fnil into #{}) (map child-pk) rows))
                       found children)))
      (for [[[table action] ids] found]
        [table ids action]))))
