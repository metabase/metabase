(ns metabase.sync.field-values-test
  "Tests around the way Metabase syncs FieldValues, and sets the values of `field.has_field_values`."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [db :as mdb]
             [driver :as driver]
             [sync :as sync :refer :all]]
            [metabase.driver.generic-sql :as sql]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values :refer [FieldValues]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; --------------------------------------------------- Helper Fns ---------------------------------------------------

(defn- insert-range-sql
  "Generate SQL to insert a row for each number in `rang`."
  [rang]
  (str "INSERT INTO blueberries_consumed (num) VALUES "
       (str/join ", " (for [n rang]
                        (str "(" n ")")))))

(def ^:private ^:dynamic *conn* nil)

(defn- do-with-blueberries-db
  "An empty canvas upon which you may paint your dreams.

  Creates a database with a single table, `blueberries_consumed`, with one column, `num`; binds this DB to
  `data/*get-db*` so you can use `data/db` and `data/id` to access it."
  {:style/indent 0}
  [f]
  (let [details {:db (str "mem:" (tu/random-name) ";DB_CLOSE_DELAY=10")}]
    (binding [mdb/*allow-potentailly-unsafe-connections* true]
      (tt/with-temp Database [db {:engine :h2, :details details}]
        (jdbc/with-db-connection [conn (sql/connection-details->spec (driver/engine->driver :h2) details)]
          (jdbc/execute! conn ["CREATE TABLE blueberries_consumed (num INTEGER NOT NULL);"])
          (binding [data/*get-db* (constantly db)]
            (binding [*conn* conn]
              (f))))))))

(defmacro ^:private with-blueberries-db {:style/indent 0} [& body]
  `(do-with-blueberries-db (fn [] ~@body)))

(defn- insert-blueberries-and-sync!
  "With the temp blueberries db from above, insert a `range` of values and re-sync the DB.

     (insert-blueberries-and-sync! [0 1 2 3]) ; insert 4 rows"
  [rang]
  (jdbc/execute! *conn* [(insert-range-sql rang)])
  (sync-database! (data/db)))


;;; ---------------------------------------------- The Tests Themselves ----------------------------------------------

;; A Field with 50 values should get marked as `auto-list` on initial sync, because it should be 'list', but was
;; marked automatically, as opposed to explicitly (`list`)
(expect
  :auto-list
  (with-blueberries-db
    ;; insert 50 rows & sync
    (insert-blueberries-and-sync! (range 50))
    ;; has_field_values should be auto-list
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; ... and it should also have some FieldValues
(expect
  #metabase.models.field_values.FieldValuesInstance
  {:values                [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33
                           34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49]
   :human_readable_values {}}
  (with-blueberries-db
    (insert-blueberries-and-sync! (range 50))
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))

;; ok, but if the number grows past the threshold & we sync again it should get unmarked as auto-list and set back to
;; `nil` (#3215)
(expect
  nil
  (with-blueberries-db
    ;; insert 50 bloobs & sync. has_field_values should be auto-list
    (insert-blueberries-and-sync! (range 50))
    (assert (= (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))
               :auto-list))
    ;; now insert enough bloobs to put us over the limit and re-sync.
    (insert-blueberries-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; has_field_values should have been set to nil.
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; ...its FieldValues should also get deleted.
(expect
  nil
  (with-blueberries-db
    ;; do the same steps as the test above...
    (insert-blueberries-and-sync! (range 50))
    (insert-blueberries-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; ///and FieldValues should also have been deleted.
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))

;; If we had explicitly marked the Field as `list` (instead of `auto-list`), adding extra values shouldn't change
;; anything!
(expect
  :list
  (with-blueberries-db
    ;; insert 50 bloobs & sync
    (insert-blueberries-and-sync! (range 50))
    ;; change has_field_values to list
    (db/update! Field (data/id :blueberries_consumed :num) :has_field_values "list")
    ;; insert more bloobs & re-sync
    (insert-blueberries-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; has_field_values shouldn't change
    (db/select-one-field :has_field_values Field :id (data/id :blueberries_consumed :num))))

;; it should still have FieldValues, and have new ones for the new Values. It should have 200 values even though this
;; is past the normal limit of 100 values!
(expect
  #metabase.models.field_values.FieldValuesInstance
  {:values                [0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33
                           34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64
                           65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89 90 91 92 93 94 95
                           96 97 98 99 100 101 102 103 104 105 106 107 108 109 110 111 112 113 114 115 116 117 118 119
                           120 121 122 123 124 125 126 127 128 129 130 131 132 133 134 135 136 137 138 139 140 141 142
                           143 144 145 146 147 148 149 150 151 152 153 154 155 156 157 158 159 160 161 162 163 164 165
                           166 167 168 169 170 171 172 173 174 175 176 177 178 179 180 181 182 183 184 185 186 187 188
                           189 190 191 192 193 194 195 196 197 198 199]
   :human_readable_values {}}
  (with-blueberries-db
    ;; follow the same steps as the test above...
    (insert-blueberries-and-sync! (range 50))
    (db/update! Field (data/id :blueberries_consumed :num) :has_field_values "list")
    (insert-blueberries-and-sync! (range 50 (+ 100 field-values/auto-list-cardinality-threshold)))
    ;; ... and FieldValues should still be there, but this time updated to include the new values!
    (db/select-one [FieldValues :values :human_readable_values], :field_id (data/id :blueberries_consumed :num))))
