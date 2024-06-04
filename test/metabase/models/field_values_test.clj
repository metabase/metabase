(ns metabase.models.field-values-test
  "Tests for specific behavior related to FieldValues and functions in the [[metabase.models.field-values]] namespace."
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.database :refer [Database]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.models.serialization :as serdes]
   [metabase.models.table :refer [Table]]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.util :as u]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel field-should-have-field-values?-test
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
                                     :semantic_type    :type/Category
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
                                    false}

                                   "type/* fields should be excluded"
                                   {{:has_field_values :list
                                     :visibility_type  :normal
                                     :base_type        :type/*}
                                    false}}
          [input expected] input->expected]
    (testing (str group "\n")
      (testing (pr-str (list 'field-should-have-field-values? input))
        (is (= expected
               (#'field-values/field-should-have-field-values? input)))))))

(deftest distinct-values-test
  (with-redefs [metadata-queries/field-distinct-values (constantly [[1] [2] [3] [4]])]
    (is (= {:values          [[1] [2] [3] [4]]
            :has_more_values false}
           (#'field-values/distinct-values {}))))

  (testing "(#2332) check that if field values are long we only store a subset of it"
    (with-redefs [metadata-queries/field-distinct-values (constantly [["AAAA"] [(str/join (repeat (+ 100 field-values/*total-max-length*) "A"))]])]
      (testing "The total length of stored values must less than our max-length-limit"
        (is (= {:values          [["AAAA"]]
                :has_more_values true}
              (#'field-values/distinct-values {})))))))

(deftest clear-field-values-for-field!-test
  (mt/with-temp [Database    {database-id :id} {}
                 Table       {table-id :id} {:db_id database-id}
                 Field       {field-id :id} {:table_id table-id}
                 FieldValues _              {:field_id field-id :values "[1, 2, 3]"}]
    (is (= [1 2 3]
           (t2/select-one-fn :values FieldValues, :field_id field-id)))
    (field-values/clear-field-values-for-field! field-id)
    (is (= nil
           (t2/select-one-fn :values FieldValues, :field_id field-id)))))

(defn- find-values [field-values-id]
  (-> (t2/select-one FieldValues :id field-values-id)
      (select-keys [:values :human_readable_values])))

(defn- sync-and-find-values! [db field-values-id]
  (sync/sync-database! db)
  (find-values field-values-id))

(deftest get-or-create-full-field-values!-test
  (mt/dataset test-data
    (testing "create a full Fieldvalues if it does not exist"
      (t2/delete! FieldValues :field_id (mt/id :categories :name) :type :full)
      (is (= :full (-> (t2/select-one Field :id (mt/id :categories :name))
                       field-values/get-or-create-full-field-values!
                       :type))
          (is (= 1 (t2/count FieldValues :field_id (mt/id :categories :name) :type :full))))

      (testing "if an Advanced FieldValues Exists, make sure we still returns the full FieldValues"
        (t2.with-temp/with-temp [FieldValues _ {:field_id (mt/id :categories :name)
                                                :type     :sandbox
                                                :hash_key "random-hash"}]
          (is (= :full (:type (field-values/get-or-create-full-field-values! (t2/select-one Field :id (mt/id :categories :name))))))))

      (testing "if an old FieldValues Exists, make sure we still return the full FieldValues and update last_used_at"
        (t2/query-one {:update :metabase_fieldvalues
                       :where [:and
                               [:= :field_id (mt/id :categories :name)]
                               [:= :type "full"]]
                       :set {:last_used_at (t/offset-date-time 2001 12)}})
        (is (= (t/offset-date-time 2001 12)
               (:last_used_at (t2/select-one FieldValues :field_id (mt/id :categories :name) :type :full))))
        (is (seq (:values (field-values/get-or-create-full-field-values! (t2/select-one Field :id (mt/id :categories :name))))))
        (is (not= (t/offset-date-time 2001 12)
                  (:last_used_at (t2/select-one FieldValues :field_id (mt/id :categories :name) :type :full))))))))

(deftest normalize-human-readable-values-test
  (testing "If FieldValues were saved as a map, normalize them to a sequence on the way out"
    (t2.with-temp/with-temp [FieldValues fv {:field_id (mt/id :venues :id)
                                             :values   (json/generate-string ["1" "2" "3"])}]
      (is (t2/query-one {:update :metabase_fieldvalues
                         :set    {:human_readable_values (json/generate-string {"1" "a", "2" "b", "3" "c"})}
                         :where  [:= :id (:id fv)]}))
      (is (= ["a" "b" "c"]
             (:human_readable_values (t2/select-one FieldValues :id (:id fv))))))))

(deftest update-human-readable-values-test
  (testing "Test \"fixing\" of human readable values when field values change"
    ;; Create a temp warehouse database that can have it's field values change
    (sql-jdbc.execute/do-with-connection-with-options
     :h2
     {:classname "org.h2.Driver", :subprotocol "h2", :subname "mem:temp"}
     {:write? true}
     (fn [^java.sql.Connection conn]
       (next.jdbc/execute! conn ["drop table foo if exists"])
       (next.jdbc/execute! conn ["create table foo (id integer primary key, category_id integer not null, desc text)"])
       (jdbc/insert-multi! {:connection conn} :foo [{:id 1 :category_id 1 :desc "foo"}
                                                    {:id 2 :category_id 2 :desc "bar"}
                                                    {:id 3 :category_id 3 :desc "baz"}])
       ;; Create a new in the Database table for this newly created temp database
       (t2.with-temp/with-temp [Database db {:engine       :h2
                                             :name         "foo"
                                             :is_full_sync true
                                             :details      "{\"db\": \"mem:temp\"}"}]
         ;; Sync the database so we have the new table and it's fields
         (sync/sync-database! db)
         (let [table-id        (t2/select-one-fn :id Table :db_id (u/the-id db) :name "FOO")
               field-id        (t2/select-one-fn :id Field :table_id table-id :name "CATEGORY_ID")
               field-values-id (t2/select-one-fn :id FieldValues :field_id field-id)]
           ;; Add in human readable values for remapping
           (is (t2/update! FieldValues field-values-id {:human_readable_values ["a" "b" "c"]}))
           (let [expected-original-values {:values                [1 2 3]
                                           :human_readable_values ["a" "b" "c"]}
                 expected-updated-values  {:values                [-2 -1 0 1 2 3]
                                           :human_readable_values ["-2" "-1" "0" "a" "b" "c"]}]
             (is (= expected-original-values
                    (find-values field-values-id)))

             (testing "There should be no changes to human_readable_values when resync'd"
               (is (= expected-original-values
                      (sync-and-find-values! db field-values-id))))

             (testing "Add new rows that will have new field values"
               (jdbc/insert-multi! {:connection conn} :foo [{:id 4 :category_id -2 :desc "foo"}
                                                            {:id 5 :category_id -1 :desc "bar"}
                                                            {:id 6 :category_id 0 :desc "baz"}])
               (testing "Sync to pickup the new field values and rebuild the human_readable_values"
                 (is (= expected-updated-values
                        (sync-and-find-values! db field-values-id)))))

             (testing "Resyncing this (with the new field values) should result in the same human_readable_values"
               (is (= expected-updated-values
                      (sync-and-find-values! db field-values-id))))

             (testing "Test that field values can be removed and the corresponding human_readable_values are removed as well"
               (jdbc/delete! {:connection conn} :foo ["id in (?,?,?)" 1 2 3])
               (is (= {:values [-2 -1 0] :human_readable_values ["-2" "-1" "0"]}
                      (sync-and-find-values! db field-values-id)))))))))))

(deftest validate-human-readable-values-test
  (testing "Should validate FieldValues :human_readable_values when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid human-readable-values"
           (t2.with-temp/with-temp [FieldValues _ {:field_id (mt/id :venues :id), :human_readable_values {"1" "A", "2", "B"}}]))))
    (testing "updating"
      (t2.with-temp/with-temp [FieldValues {:keys [id]} {:field_id (mt/id :venues :id), :human_readable_values []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid human-readable-values"
             (t2/update! FieldValues id {:human_readable_values {"1" "A", "2", "B"}})))))))

(deftest rescanned-human-readable-values-test
  (testing "Make sure FieldValues are calculated and saved correctly when remapping is in place (#13235)"
    (mt/dataset test-data
      (mt/with-temp-copy-of-db
        (letfn [(field-values []
                  (t2/select-one FieldValues :field_id (mt/id :orders :product_id)))]
          (testing "Should have no FieldValues initially"
            (is (= nil
                   (field-values))))
          (t2.with-temp/with-temp [Dimension _ {:field_id                (mt/id :orders :product_id)
                                                :human_readable_field_id (mt/id :products :title)
                                                :type                    "external"}]
            (mt/with-temp-vals-in-db Field (mt/id :orders :product_id) {:has_field_values "list"}
              (is (= ::field-values/fv-created
                     (field-values/create-or-update-full-field-values! (t2/select-one Field :id (mt/id :orders :product_id)))))
              (is (partial= {:field_id              (mt/id :orders :product_id)
                             :values                [1 2 3 4]
                             :human_readable_values []}
                            (field-values))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Life Cycle                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest insert-field-values-type-test
  (testing "fieldvalues type=:full shouldn't have hash_key"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Full FieldValues shouldnt have hash_key"
         (t2.with-temp/with-temp [FieldValues _ {:field_id (mt/id :venues :id)
                                                 :type :full
                                                 :hash_key "random-hash"}]))))

  (testing "Advanced fieldvalues requires a hash_key"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Advanced FieldValues requires a hash_key"
         (t2.with-temp/with-temp [FieldValues _ {:field_id (mt/id :venues :id)
                                                 :type :sandbox}])))))

(deftest insert-full-field-values-should-remove-all-cached-field-values
  (mt/with-temp [FieldValues sandbox-fv {:field_id (mt/id :venues :id)
                                         :type     :sandbox
                                         :hash_key "random-hash"}]
    (t2/insert! FieldValues {:field_id (mt/id :venues :id)
                             :type     :full})
    (is (not (t2/exists? FieldValues :id (:id sandbox-fv))))))

(deftest update-full-field-values-should-remove-all-cached-field-values
  (mt/with-temp [FieldValues fv         {:field_id (mt/id :venues :id)
                                         :type     :full}
                 FieldValues sandbox-fv {:field_id (mt/id :venues :id)
                                         :type     :sandbox
                                         :hash_key "random-hash"}]
    (t2/update! FieldValues (:id fv) {:values [1 2 3]})
    (is (not (t2/exists? FieldValues :id (:id sandbox-fv))))))

(deftest cant-update-type-or-has-of-a-field-values-test
  (t2.with-temp/with-temp [FieldValues fv {:field_id (mt/id :venues :id)
                                           :type     :sandbox
                                           :hash_key "random-hash"}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cant update type or hash_key for a FieldValues."
         (t2/update! FieldValues (:id fv) {:type :full})))

    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Cant update type or hash_key for a FieldValues."
         (t2/update! FieldValues (:id fv) {:hash_key "new-hash"})))))


(deftest identity-hash-test
  (testing "Field hashes are composed of the name and the table's identity-hash"
    (mt/with-temp [Database    db    {:name "field-db" :engine :h2}
                   Table       table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                   Field       field {:name "sku" :table_id (:id table)}
                   FieldValues fv    {:field_id (:id field)}]
      (is (= "6f5bb4ba"
             (serdes/raw-hash [(serdes/identity-hash field)])
             (serdes/identity-hash fv))))))
