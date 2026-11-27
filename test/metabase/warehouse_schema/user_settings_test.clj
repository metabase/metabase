(ns metabase.warehouse-schema.user-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.util :as u]
   [metabase.util.connection :as u.conn]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [toucan2.core :as t2]))

(def ^:private unused-flags
  "Flags left in the app DB for older releases that still read them."
  #{:caveats_set :points_of_interest_set})

(defn- flagged-columns
  "The user-settable columns of `columns` that have a used `_set` column in the table of `model`, mapped to it."
  [model columns]
  (let [db-columns (into #{}
                         (map (comp keyword u/lower-case-en))
                         (keys (u.conn/app-db-column-types (mdb/app-db) (t2/table-name model))))]
    (into {}
          (keep (fn [column]
                  (let [flag (keyword (str (name column) "_set"))]
                    (when (and (db-columns flag) (not (unused-flags flag)))
                      [column flag]))))
          columns)))

(deftest table-set-flags-cover-the-database-test
  (testing "every user-settable Table column with a _set column in the app DB is in table-set-flags"
    (let [flagged (flagged-columns :model/TableUserSettings user-settings/user-settable-table-columns)]
      (is (seq flagged))
      (is (= flagged (select-keys user-settings/table-set-flags (keys flagged)))))))

(deftest field-set-flags-cover-the-database-test
  (testing "every user-settable Field column with a _set column in the app DB is in field-set-flags"
    (let [flagged (flagged-columns :model/FieldUserSettings user-settings/user-settable-field-columns)]
      (is (seq flagged))
      (is (= flagged (select-keys user-settings/field-set-flags (keys flagged)))))))
