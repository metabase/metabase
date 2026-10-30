(ns metabase.metabot.tools.recovery-hints-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.tools.recovery-hints :as recovery-hints]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel ambiguous-field-hint-test
  (is (= (str "The field name matches more than one column in this table, so it cannot be referenced by name. "
              "Tell the user about the ambiguous column name.")
         (recovery-hints/recovery-hint {:error :ambiguous-field}))))

(deftest ^:parallel cross-database-hint-test
  (doseq [error [:cross-database-card :cross-database-measure :cross-database-segment]]
    (testing error
      (is (= (str "A query can only reference saved questions, models, metrics, measures and segments "
                  "from its own database. Use one from that database, or change the source to a table "
                  "in the referenced item's database.")
             (recovery-hints/recovery-hint {:error error}))))))

(deftest ^:parallel ambiguous-database-name-hint-test
  (is (= "Ask the user to rename one of the databases."
         (recovery-hints/recovery-hint {:error :ambiguous-database-name}))))

(def ^:private list-tables-hint
  (str "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables and schemas, "
       "then retry with an exact portable FK from the response."))

(def ^:private ambiguous-table-hint
  (str "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables "
       "and retry with a more specific portable FK."))

(def ^:private list-fields-hint
  "Call `read_resource` with `metabase://table/<numeric id>/fields` to list this table's columns.")

(def ^:private list-fk-columns-hint
  (str "Call `read_resource` with `metabase://table/<numeric id>/fields` for the source table "
       "to list the available foreign-key columns."))

(defn- with-id
  "`hint` with its `<numeric id>` replaced by `id`."
  [hint id]
  (str/replace hint "<numeric id>" (str id)))

(deftest ^:parallel table-hints-name-the-table-id-test
  (testing "an unknown column names the table that its field path names"
    (is (= (with-id list-fields-hint 42)
           (recovery-hints/recovery-hint {:error :unknown-field :table-id 42}))))
  (testing "an ambiguous foreign key names the source table"
    (is (= (with-id list-fk-columns-hint 42)
           (recovery-hints/recovery-hint {:error :ambiguous-fk :source-table 42})))))

(deftest ^:parallel ambiguous-fk-card-source-keeps-the-card-hint-test
  (let [hint (recovery-hints/recovery-hint {:error            :ambiguous-fk
                                            :source-card      7
                                            :source-card-type "model"
                                            :source-table     42})]
    (is (= (str "Call `read_resource` with `metabase://model/7/fields` to list the foreign-key columns "
                "this model returns.")
           hint))))

(deftest ^:parallel hints-keep-the-placeholder-without-an-id-test
  (doseq [[data expected] [[{:error :unknown-table}                  list-tables-hint]
                           [{:error :ambiguous-table}                ambiguous-table-hint]
                           [{:error :unknown-field}                  list-fields-hint]
                           [{:error :ambiguous-fk}                   list-fk-columns-hint]
                           [{:error :unknown-table :database-id 0}   list-tables-hint]
                           [{:error :ambiguous-table :database-id 0} ambiguous-table-hint]
                           [{:error :unknown-field :table-id 0}      list-fields-hint]
                           [{:error :ambiguous-fk :source-table 0}   list-fk-columns-hint]]]
    (testing (pr-str data)
      (is (= expected (recovery-hints/recovery-hint data))))))

(deftest ^:parallel other-codes-ignore-table-ids-test
  (testing "a numeric table id that does not resolve keeps the database placeholder"
    (is (str/includes? (recovery-hints/recovery-hint {:error :unknown-table-id :table-id 42})
                       "`metabase://database/<numeric id>/tables`")))
  (testing "a numeric field id keeps the table placeholder"
    (is (= list-fields-hint
           (recovery-hints/recovery-hint {:error :unknown-field-id :field-id 42 :table-id 42}))))
  (testing "an ambiguous foreign key through a join has no hint"
    (is (nil? (recovery-hints/recovery-hint {:error :ambiguous-fk-via-join :source-table 42})))))

(deftest database-hints-name-a-readable-database-test
  (mt/with-current-user (mt/user->id :crowberto)
    (testing "an unknown table names the query's database"
      (is (= (with-id list-tables-hint (mt/id))
             (recovery-hints/recovery-hint {:error :unknown-table :database-id (mt/id)}))))
    (testing "an ambiguous table names the query's database"
      (is (= (with-id ambiguous-table-hint (mt/id))
             (recovery-hints/recovery-hint {:error :ambiguous-table :database-id (mt/id)}))))))
