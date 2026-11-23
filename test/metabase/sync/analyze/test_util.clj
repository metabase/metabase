(ns metabase.sync.analyze.test-util
  "Databases of Tables and Fields made in the app DB alone, to count the statements a sync step issues at two sizes."
  (:require
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- do-with-database
  "Call `(f database)` with a Database of `n-tables` Tables of `n-fields` text Fields each, `(field-row j)` merged into
  the `j`th Field of each Table, the Database as sync steps get it."
  [n-tables n-fields field-row f]
  (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
    (let [table-ids (t2/insert-returning-pks! :model/Table (for [i (range n-tables)]
                                                             {:db_id  db-id
                                                              :name   (str "T" i)
                                                              :schema "PUBLIC"
                                                              :active true}))]
      (t2/insert! :model/Field (for [table-id table-ids
                                     j        (range n-fields)]
                                 (merge {:table_id          table-id
                                         :name              (str "C" j)
                                         :base_type         :type/Text
                                         :database_type     "VARCHAR"
                                         :database_position j
                                         :position          j
                                         :active            true
                                         :visibility_type   :normal}
                                        (field-row j))))
      (f (driver.u/lib-database db-id)))))

(defn statement-count
  "The number of app-DB statements `(step! database)` issues over a Database of `n-tables` Tables of `n-fields` Fields,
  `(field-row j)` merged into the `j`th Field of each, after `(prepare! database)`."
  [n-tables n-fields field-row prepare! step!]
  (do-with-database n-tables n-fields field-row
                    (fn [database]
                      (prepare! database)
                      (t2/with-call-count [call-count]
                        (step! database)
                        (call-count)))))

(defn statement-counts-by-tables
  "[[statement-count]] at 4 and 16 Tables of 5 Fields, after a warm-up at 2 Tables."
  [field-row prepare! step!]
  (statement-count 2 5 field-row prepare! step!)
  (mapv #(statement-count % 5 field-row prepare! step!) [4 16]))

(defn statement-counts-by-fields
  "[[statement-count]] at 5 and 20 Fields in each of 4 Tables, after a warm-up at 2 Fields."
  [field-row prepare! step!]
  (statement-count 4 2 field-row prepare! step!)
  (mapv #(statement-count 4 % field-row prepare! step!) [5 20]))
