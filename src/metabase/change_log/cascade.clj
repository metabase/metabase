(ns metabase.change-log.cascade
  "Finds the rows of logged tables that the database deletes (`ON DELETE CASCADE`) or updates (`ON DELETE SET NULL`)
  when a row is deleted, also through tables that are not logged. No model hook sees those writes. The foreign keys
  come from the app DB's metadata, and are cached."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.change-log.db :as change-log.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn logged-models
  "The logged models that have loaded, by table name."
  []
  (into {}
        (for [model (descendants :hook/change-log)
              ;; other keywords derive from models too, such as `:metadata/card`
              :when (= "model" (namespace model))]
          [(name (t2/table-name model)) model])))

(defn- to-logged-tables
  "The foreign keys of `fks` that a delete follows to a logged table, by the table they reference. One is kept when
  its child is logged, or when it is a cascade to a child that a kept one references. `:child-pk` is the primary key
  of a logged child, from `table->pk`."
  [fks table->pk]
  (loop [kept #{}]
    (let [parents (into #{} (map :parent) kept)
          more    (into #{}
                        (filter #(or (table->pk (:child %))
                                     (and (= :cascade (:rule %)) (parents (:child %)))))
                        fks)]
      (if (= kept more)
        (group-by :parent (map #(assoc % :child-pk (table->pk (:child %))) kept))
        (recur more)))))

(def ^:private foreign-keys*
  (mdb/memoize-for-application-db
   (fn [table->pk]
     (to-logged-tables (change-log.db/foreign-keys) table->pk))))

(defn foreign-keys
  "The [[change-log.db/foreign-keys]] that lead to the tables of the [[logged-models]], by the table they reference:

      {\"metabase_table\" [{:parent \"metabase_table\", :parent-column :id, :rule :cascade,
                          :child \"metabase_field\", :child-pk :id, :column :table_id}]}

  `:child-pk` is nil for a child that is not logged."
  []
  (foreign-keys* (update-vals (logged-models) #(first (t2/primary-keys %)))))

(defn referenced-columns
  "The columns of `table-name` that the [[foreign-keys]] `fks` point to."
  [fks table-name]
  (distinct (map :parent-column (get fks table-name))))

(defn changes
  "What the database changes in logged tables when `rows` of `table-name` are deleted, as
  `[table-name row-ids action]`. The action is `delete` for a cascade, which is followed down, and `update` for a
  SET NULL. `rows` must include the [[referenced-columns]] of `table-name`."
  [fks table-name rows]
  ;; `found` is `{[table pk action] #{row}}`, where `pk` is nil for a table that is not logged. A row already found
  ;; is not followed again, which ends a cycle.
  (loop [queue [[table-name rows]], found {}]
    (if-let [[[table rows] & queue] (seq queue)]
      (let [children (for [{:keys [child child-pk column parent-column rule]} (get fks table)
                           :let  [values (distinct (keep parent-column rows))
                                  k      [child child-pk (if (= :cascade rule) "delete" "update")]]
                           :when (seq values)
                           :let  [rows (remove (get found k #{})
                                               (change-log.db/rows-where
                                                child column values
                                                (cond->> (referenced-columns fks child)
                                                  child-pk (cons child-pk))))]
                           :when (seq rows)]
                       [k rows])]
        (recur (into (vec queue) (for [[[child _ action] rows] children :when (= "delete" action)] [child rows]))
               (reduce (fn [found [k rows]] (update found k (fnil into #{}) rows)) found children)))
      (for [[[table pk action] rows] found
            :when pk]
        [table (map pk rows) action]))))
