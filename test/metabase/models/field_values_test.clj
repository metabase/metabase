(ns metabase.models.field-values-test
  "Tests for specific behavior related to FieldValues and functions in the `metabase.models.field-values` namespace."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [clojure.java.jdbc :as jdbc]
            [metabase
             [db :as mdb]
             [sync :as sync]
             [test :as mt]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [field-values :as field-values :refer :all]
             [table :refer [Table]]]
            [toucan.db :as db]))

(deftest field-should-have-field-values?-test
  (doseq [[group input->expected] {"Text and Category Fields"
                                   {{:has_field_values :list
                                     :visibility_type  :normal
                                     :base_type        :type/Text}
                                    true

                                    {:has_field_values nil
                                     :visibility_type  :normal
                                     :base_type        :type/Text}
                                    false

                                    {:has_field_values :list
                                     :special_type     :type/Category
                                     :visibility_type  :normal
                                     :base_type        "type/Boolean"}
                                    true}

                                   "retired/sensitive/hidden/details-only fields should always be excluded"
                                   {{:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :retired}
                                    false

                                    {:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :sensitive}
                                    false

                                    {:has_field_values :list
                                     :visibility_type  :sensitive
                                     :base_type        :type/Text}
                                    false

                                    {:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :hidden}
                                    false

                                    {:has_field_values :list
                                     :visibility_type  :hidden
                                     :base_type        :type/Text}
                                    false

                                    {:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :details-only}
                                    false

                                    {:has_field_values :list
                                     :visibility_type  :details-only
                                     :base_type        :type/Text}
                                    false}

                                   "date/time based fields should always be excluded"
                                   {{:base_type        :type/Date
                                     :has_field_values :list
                                     :visibility_type  :normal}
                                    false

                                    {:base_type        :type/DateTime
                                     :has_field_values :list
                                     :visibility_type  :normal}
                                    false

                                    {:base_type        :type/Time
                                     :has_field_values :list
                                     :visibility_type  :normal}
                                    false}}
          [input expected] input->expected]
    (testing (str group "\n")
      (testing (pr-str (list 'field-should-have-field-values? input))
        (is (= expected
               (#'field-values/field-should-have-field-values? input)))))))

(deftest distinct-values-test
  (with-redefs [metadata-queries/field-distinct-values (constantly [1 2 3 4])]
    (is (= [1 2 3 4]
           (#'field-values/distinct-values {}))))

  (testing "(#2332) check that if field values are long we skip over them"
    (with-redefs [metadata-queries/field-distinct-values (constantly [(str/join (repeat 50000 "A"))])]
      (is (= nil
             (#'field-values/distinct-values {}))))))

(deftest clear-field-values!-test
  (mt/with-temp* [Database    [{database-id :id}]
                  Table       [{table-id :id} {:db_id database-id}]
                  Field       [{field-id :id} {:table_id table-id}]
                  FieldValues [_              {:field_id field-id, :values "[1,2,3]"}]]
    (is (= [1 2 3]
           (db/select-one-field :values FieldValues, :field_id field-id)))
    (#'field-values/clear-field-values! field-id)
    (is (= nil
           (db/select-one-field :values FieldValues, :field_id field-id)))))

(defn- find-values [field-values-id]
  (-> (db/select-one FieldValues :id field-values-id)
      (select-keys [:values :human_readable_values])))

(defn- sync-and-find-values [db field-values-id]
  (sync/sync-database! db)
  (find-values field-values-id))

(deftest update-human-readable-values-test
  (testing "Test \"fixing\" of human readable values when field values change"
    (binding [mdb/*allow-potentailly-unsafe-connections* true]
      ;; Create a temp warehouse database that can have it's field values change
      (jdbc/with-db-connection [conn {:classname "org.h2.Driver", :subprotocol "h2", :subname "mem:temp"}]
        (jdbc/execute! conn ["drop table foo if exists"])
        (jdbc/execute! conn ["create table foo (id integer primary key, category_id integer not null, desc text)"])
        (jdbc/insert-multi! conn :foo [{:id 1 :category_id 1 :desc "foo"}
                                       {:id 2 :category_id 2 :desc "bar"}
                                       {:id 3 :category_id 3 :desc "baz"}])
        ;; Create a new in the Database table for this newly created temp database
        (mt/with-temp Database [db {:engine       :h2
                                    :name         "foo"
                                    :is_full_sync true
                                    :details      "{\"db\": \"mem:temp\"}"}]
          ;; Sync the database so we have the new table and it's fields
          (sync/sync-database! db)
          (let [table-id        (db/select-one-field :id Table :db_id (u/get-id db) :name "FOO")
                field-id        (db/select-one-field :id Field :table_id table-id :name "CATEGORY_ID")
                field-values-id (db/select-one-field :id FieldValues :field_id field-id)]
            ;; Add in human readable values for remapping
            (db/update! FieldValues field-values-id {:human_readable_values "[\"a\",\"b\",\"c\"]"})
            (let [expected-original-values {:values                [1 2 3]
                                            :human_readable_values ["a" "b" "c"]}
                  expected-updated-values  {:values                [-2 -1 0 1 2 3]
                                            :human_readable_values ["-2" "-1" "0" "a" "b" "c"]}]
              (is (= expected-original-values
                     (find-values field-values-id)))

              (testing "There should be no changes to human_readable_values when resync'd"
                (is (= expected-original-values
                       (sync-and-find-values db field-values-id))))

              (testing "Add new rows that will have new field values"
                (jdbc/insert-multi! conn :foo [{:id 4 :category_id -2 :desc "foo"}
                                               {:id 5 :category_id -1 :desc "bar"}
                                               {:id 6 :category_id 0 :desc "baz"}])
                (testing "Sync to pickup the new field values and rebuild the human_readable_values"
                  (is (= expected-updated-values
                         (sync-and-find-values db field-values-id)))))

              (testing "Resyncing this (with the new field values) should result in the same human_readable_values"
                (is (= expected-updated-values
                       (sync-and-find-values db field-values-id))))

              (testing "Test that field values can be removed and the corresponding human_readable_values are removed as well"
                (jdbc/delete! conn :foo ["id in (?,?,?)" 1 2 3])
                (is (= {:values [-2 -1 0] :human_readable_values ["-2" "-1" "0"]}
                       (sync-and-find-values db field-values-id)))))))))))
