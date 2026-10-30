(ns metabase.change-log.cascade
  "The rows of logged tables that the database itself changes when a row is deleted, through foreign keys into logged
  tables: `ON DELETE CASCADE` deletes the children, and their children in turn, and `ON DELETE SET NULL` updates them.
  No model hook sees those writes. The deleted row can be of any model. The foreign keys are the imported keys of the
  logged tables in the app DB's JDBC metadata, read once per process, app DB and set of logged models. A logged model
  counts only once its namespace has loaded (`metabase.change-log.core`, \"To log a model\", step 2)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.change-log.db :as change-log.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- models
  "The models that derive `hook`, by table name."
  [hook]
  (into {}
        (for [model (descendants hook)
              :when (= "model" (namespace model))]
          [(name (t2/table-name model)) model])))

(def ^:private foreign-keys*
  (mdb/memoize-for-application-db change-log.db/foreign-keys))

(defn- foreign-keys []
  (let [logged (models :hook/change-log)]
    [logged (foreign-keys* (set (keys logged)))]))

(defn referenced-columns
  "The columns of `table-name` that foreign keys into logged tables reference."
  [table-name]
  (distinct (map :parent-column (get (second (foreign-keys)) table-name))))

(defn changes
  "The `[table-name row-ids action]` of the rows of logged tables that deleting `rows` of `table-name` changes through
  foreign keys: `delete` for the rows it cascades to, at any depth, and `update` for the rows it sets a column of to
  NULL."
  [table-name rows]
  (let [[logged fks] (foreign-keys)
        pk           #(first (t2/primary-keys (logged %)))]
    (loop [queue [[table-name rows]], seen #{}, out []]
      (if-let [[[table rows] & more] (seq queue)]
        (let [found (for [{:keys [child column parent-column rule]} (get fks table)
                          :let  [values (into [] (comp (keep parent-column) (distinct)) rows)]
                          :when (seq values)]
                      [child rule (change-log.db/rows-where child column values
                                                            (cons (pk child) (map :parent-column (get fks child))))])
              fresh (fn [child rows] (remove #(contains? seen [child (get % (pk child))]) rows))
              next  (for [[child rule rows] found
                          :when (= :cascade rule)
                          :let  [rows (fresh child rows)]
                          :when (seq rows)]
                      [child rows])]
          (recur (into (vec more) next)
                 (into seen (for [[child rows] next, r rows] [child (get r (pk child))]))
                 (into out (for [[child rule rows] found
                                 :let  [ids (distinct (map #(get % (pk child)) rows))]
                                 :when (seq ids)]
                             [child ids (if (= :cascade rule) "delete" "update")]))))
        (for [[[table action] entries] (group-by (juxt first last) out)]
          [table (distinct (mapcat second entries)) action])))))
