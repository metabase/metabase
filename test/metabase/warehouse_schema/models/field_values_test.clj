(ns ^:mb/driver-tests metabase.warehouse-schema.models.field-values-test
  "Tests for specific behavior related to FieldValues and functions in
  the [[metabase.warehouse-schema.models.field-values]] namespace."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.serialization :as serdes]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.warehouse-schema.field-values.distinct-batch :as distinct-batch]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private base-types-without-field-values
  #{:type/*
    :type/JSON
    :type/Array
    :type/DruidJSON
    :type/Dictionary
    :type/Structured
    :type/Collection
    :type/OracleCLOB
    :type/SnowflakeVariant
    :type/DruidHyperUnique
    :type/TimeWithTZ
    :type/TimeWithLocalTZ
    :type/Time
    :type/UpdatedTime
    :type/Instant
    :type/UpdatedDate
    :type/JoinTimestamp
    :type/DeletionTime
    :type/CancelationDate
    :type/CancelationTime
    :type/DeletionDate
    :type/DateTimeWithZoneID
    :type/UpdatedTimestamp
    :type/Birthdate
    :type/Date
    :type/SerializedJSON
    :type/DateTimeWithZoneOffset
    :type/Temporal
    :type/HasDate
    :type/HasTime
    :type/CreationTimestamp
    :type/Large
    :type/JoinTime
    :type/CreationTime
    :type/DateTimeWithTZ
    :type/JoinDate
    :type/CancelationTimestamp
    :type/CreationDate
    :type/XML
    :type/field-values-unsupported
    :type/DeletionTimestamp
    :type/TimeWithZoneOffset
    :type/DateTime
    :type/DateTimeWithLocalTZ
    :type/Interval})

(deftest ^:parallel base-type-should-have-field-values-test
  (doseq [base-type (conj (descendants :type/*) :type/*)]
    (let [expected (not (contains? base-types-without-field-values base-type))]
      (testing (str base-type " should " (when-not expected " not ") "have field values")
        (is (= expected
               (#'field-values/field-should-have-field-values? {:has_field_values :list
                                                                :visibility_type  :normal
                                                                :base_type        base-type})))))))

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

                                   "retired/sensitive/hidden fields should always be excluded"
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
                                    false}

                                   "details-only fields should be included (fixes #10851)"
                                   {{:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :details-only}
                                    true

                                    {:has_field_values :list
                                     :visibility_type  :details-only
                                     :base_type        :type/Text}
                                    true}

                                   "fields with preview_display=false should be excluded"
                                   {{:base_type        :type/Boolean
                                     :has_field_values :list
                                     :visibility_type  :normal
                                     :preview_display  false}
                                    false

                                    {:has_field_values :list
                                     :visibility_type  :details-only
                                     :base_type        :type/Text
                                     :preview_display  false}
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

(defn distinct-field-values
  [id]
  (field-values/distinct-values (t2/select-one :model/Field id)))

(deftest distinct-values-test
  (testing "Correctly get distinct field values for text fields"
    (is (= {:values [["Doohickey"] ["Gadget"] ["Gizmo"] ["Widget"]]}
           (distinct-field-values (mt/id :products :category)))))
  (testing "Correctly get distinct field values for non-text fields"
    (is (= {:values [[1] [2] [3] [4] [5]]}
           (distinct-field-values (mt/id :reviews :rating))))))

(deftest clear-field-values-for-field!-test
  (mt/with-temp [:model/Database    {database-id :id} {}
                 :model/Table       {table-id :id} {:db_id database-id}
                 :model/Field       {field-id :id} {:table_id table-id}
                 :model/FieldValues _              {:field_id field-id :values "[1, 2, 3]"}]
    (is (= [1 2 3]
           (t2/select-one-fn :values :model/FieldValues, :field_id field-id)))
    (field-values/clear-field-values-for-field! field-id)
    (is (= nil
           (t2/select-one-fn :values :model/FieldValues, :field_id field-id)))))

(defn- find-values [field-values-id]
  (-> (t2/select-one :model/FieldValues :id field-values-id)
      (select-keys [:values :human_readable_values])))

(defn- sync-and-find-values! [db field-values-id]
  (sync/sync-database! db)
  (find-values field-values-id))

(deftest implicit-deduplication-test
  (let [before (t/zoned-date-time)
        after  (t/plus before (t/millis 1))
        later  (t/plus after (t/millis 1))]
    (mt/with-temp [:model/Database    {database-id :id} {}
                   :model/Table       {table-id :id}    {:db_id database-id}
                   :model/Field       {field-id :id}     {:table_id table-id}
                   :model/FieldValues _                 {:field_id field-id :type :full :values ["a" "b"] :human_readable_values ["A" "B"] :created_at before :updated_at before}
                   :model/FieldValues _                 {:field_id field-id :type :full :values ["c" "d"] :human_readable_values ["C" "D"] :created_at before :updated_at later}
                   :model/FieldValues _                 {:field_id field-id :type :full :values ["e" "f"] :human_readable_values ["E" "F"] :created_at after :updated_at after}]
      (testing "When we have multiple FieldValues rows in the database, "
        (is (= 3 (count (t2/select :model/FieldValues :field_id field-id :type :full :hash_key nil))))
        (testing "we always return the most recently updated row"
          (is (= ["C" "D"] (:human_readable_values (field-values/get-latest-full-field-values field-id))))
          (testing "... and older rows are implicitly deleted"
            (is (= 1 (count (t2/select :model/FieldValues :field_id field-id :type :full))))
            ;; double check that we deleted the correct row
            (is (= ["C" "D"] (:human_readable_values (field-values/get-latest-full-field-values field-id))))))))))

(deftest implicit-deduplication-batched-test
  (let [before (t/zoned-date-time)
        after  (t/plus before (t/millis 1))
        later  (t/plus after (t/millis 1))]
    (mt/with-temp [:model/Database    {database-id :id} {}
                   :model/Table       {table-id :id}    {:db_id database-id}
                   ;; will have duplicated field values
                   :model/Field       {field-id-1 :id}     {:table_id table-id}
                   ;; have only one field values
                   :model/Field       {field-id-2 :id}     {:table_id table-id}
                   ;; doesn't have a a field values
                   :model/Field       {field-id-3 :id}     {:table_id table-id}
                   :model/FieldValues _                 {:field_id field-id-1 :type :full :values ["a" "b"] :human_readable_values ["A" "B"] :created_at before :updated_at before}
                   :model/FieldValues _                 {:field_id field-id-1 :type :full :values ["c" "d"] :human_readable_values ["C" "D"] :created_at before :updated_at later}
                   :model/FieldValues _                 {:field_id field-id-2 :type :full :values ["e" "f"] :human_readable_values ["E" "F"] :created_at after :updated_at after}]
      (testing "When we have multiple FieldValues rows in the database, we always return the most recently updated row"
        (is (=? {field-id-1 {:values ["c" "d"]}
                 field-id-2 {:values ["e" "f"]}}
                (field-values/batched-get-latest-full-field-values [field-id-1 field-id-2 field-id-3])))
        (testing "and older values are implicitly deleted"
          (is (= 1 (count (t2/select :model/FieldValues :field_id field-id-1 :type :full)))))))))

(deftest get-or-create-full-field-values!-test
  (mt/dataset test-data
    (testing "create a full Fieldvalues if it does not exist"
      (t2/delete! :model/FieldValues :field_id (mt/id :categories :name) :type :full)
      (is (= :full (-> (t2/select-one :model/Field :id (mt/id :categories :name))
                       field-values/get-or-create-full-field-values!
                       :type)))
      (is (= 1 (t2/count :model/FieldValues :field_id (mt/id :categories :name) :type :full)))
      (testing "if an Advanced FieldValues Exists, make sure we still returns the full FieldValues"
        (mt/with-temp [:model/FieldValues _ {:field_id (mt/id :categories :name)
                                             :type     :sandbox
                                             :hash_key "random-hash"}]
          (is (= :full (:type (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :categories :name))))))))
      (testing "if an old FieldValues Exists, make sure we still return the full FieldValues and update last_used_at"
        (t2/query-one {:update :metabase_fieldvalues
                       :where [:and
                               [:= :field_id (mt/id :categories :name)]
                               [:= :type "full"]]
                       :set {:last_used_at (t/offset-date-time 2001 12)}})
        (is (= (t/offset-date-time 2001 12)
               (:last_used_at (t2/select-one :model/FieldValues :field_id (mt/id :categories :name) :type :full))))
        (is (seq (:values (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id (mt/id :categories :name))))))
        (is (not= (t/offset-date-time 2001 12)
                  (:last_used_at (t2/select-one :model/FieldValues :field_id (mt/id :categories :name) :type :full))))))))

(deftest normalize-human-readable-values-test
  (testing "If FieldValues were saved as a map, normalize them to a sequence on the way out"
    (mt/with-temp [:model/FieldValues fv {:field_id (mt/id :venues :id)
                                          :values   (json/encode ["1" "2" "3"])}]
      (is (t2/query-one {:update :metabase_fieldvalues
                         :set    {:human_readable_values (json/encode {"1" "a", "2" "b", "3" "c"})}
                         :where  [:= :id (:id fv)]}))
      (is (= ["a" "b" "c"]
             (:human_readable_values (t2/select-one :model/FieldValues :id (:id fv))))))))

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
       (mt/with-temp [:model/Database db {:engine       :h2
                                          :name         "foo"
                                          :is_full_sync true
                                          :details      "{\"db\": \"mem:temp\"}"}]
         ;; Sync the database so we have the new table and it's fields
         (sync/sync-database! db)
         (let [table-id        (t2/select-one-fn :id :model/Table :db_id (u/the-id db) :name "FOO")
               field-id        (t2/select-one-fn :id :model/Field :table_id table-id :name "CATEGORY_ID")
               ;; Manually activate Field values since they are not created during sync (#53387)
               _               (field-values/get-or-create-full-field-values! (t2/select-one :model/Field :id field-id))
               field-values-id (t2/select-one-fn :id :model/FieldValues :field_id field-id)]
           ;; Add in human readable values for remapping
           (is (t2/update! :model/FieldValues field-values-id {:human_readable_values ["a" "b" "c"]}))
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
           (mt/with-temp [:model/FieldValues _ {:field_id (mt/id :venues :id), :human_readable_values {"1" "A", "2", "B"}}]))))
    (testing "updating"
      (mt/with-temp [:model/FieldValues {:keys [id]} {:field_id (mt/id :venues :id), :human_readable_values []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid human-readable-values"
             (t2/update! :model/FieldValues id {:human_readable_values {"1" "A", "2", "B"}})))))))

(deftest rescanned-human-readable-values-test
  (testing "Make sure FieldValues are calculated and saved correctly when remapping is in place (#13235)"
    (mt/dataset test-data
      (mt/with-temp-copy-of-db
        (letfn [(field-values []
                  (t2/select-one :model/FieldValues :field_id (mt/id :orders :product_id)))]
          (testing "Should have no FieldValues initially"
            (is (= nil
                   (field-values))))
          (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :orders :product_id)
                                             :human_readable_field_id (mt/id :products :title)
                                             :type                    "external"}]
            (mt/with-temp-vals-in-db :model/Field (mt/id :orders :product_id) {:has_field_values "list"}
              (is (= ::field-values/fv-created
                     (field-values/create-or-update-full-field-values! (t2/select-one :model/Field :id (mt/id :orders :product_id)))))
              (is (partial= {:field_id              (mt/id :orders :product_id)
                             :values                [1 2 3 4]
                             :human_readable_values []}
                            (field-values))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 Life Cycle                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest insert-field-values-hook-test
  (testing "The model hooks prevent us inserting invalid type / hash_key combination"
    (let [field-id (mt/id :venues :id)]
      (try
        (is (thrown-with-msg? ExceptionInfo
                              #"Full FieldValues shouldn't have hash_key"
                              (t2/insert! :model/FieldValues :field_id field-id :hash_key "12345")))
        (is (thrown-with-msg? ExceptionInfo
                              #"Full FieldValues shouldn't have hash_key"
                              (t2/insert! :model/FieldValues :field_id field-id :type :full :hash_key "12345")))
        (is (thrown-with-msg? ExceptionInfo
                              #"Advanced FieldValues require a hash_key"
                              (t2/insert! :model/FieldValues :field_id field-id :type :sandbox)))
        (is (thrown-with-msg? ExceptionInfo
                              #"Advanced FieldValues require a hash_key"
                              (t2/insert! :model/FieldValues :field_id field-id :type :sandbox :hash_key " ")))
        (finally
          ;; Clean up in case there were any failed assertions, and we ended up inserting values
          (t2/delete! :model/FieldValues :field_id field-id))))))

(deftest update-field-values-hook-test
  (mt/with-temp [:model/FieldValues {full-id :id}    {:field_id (mt/id :venues :id)
                                                      :type     :full}
                 :model/FieldValues {sandbox-id :id} {:field_id (mt/id :venues :id)
                                                      :type     :sandbox
                                                      :hash_key "random-hash"}]
    (testing "The model hooks prevent us changing the intrinsic identity of a field values"
      (doseq [[id update-map] [[sandbox-id {:field_id 1}]
                               [sandbox-id {:type :full}]
                               [sandbox-id {:type nil}]
                               ;; this one should be ok, but toucan doesn't give the hook enough info to know better
                               [full-id {:type nil}]
                               [full-id {:type :sandbox}]
                               [sandbox-id {:hash_key "another-hash"}]
                               [sandbox-id {:hash_key nil}]
                               [full-id {:hash_key "random-hash"}]
                               ;; not even if it keeps type / hash consistency
                               [sandbox-id {:type :full, :hash_key nil}]
                               [full-id {:type :sandbox, :hash_key "random-hash"}]]]
        (is (thrown-with-msg? ExceptionInfo
                              #"Can't update field_id, type, or hash_key for a FieldValues."
                              (t2/update! :model/FieldValues id update-map)))))
    (testing "The model hooks permits mention of the existing values"
      (doseq [[id update-map] [[full-id {:field_id (mt/id :venues :id)}]
                               [sandbox-id {:type :sandbox}]
                               [full-id {:type :full}]
                               [sandbox-id {:hash_key "random-hash"}]
                               [full-id {:hash_key nil}]
                               [full-id {:type :full, :hash_key nil}]
                               [sandbox-id {:type :sandbox, :hash_key "random-hash"}]]]
        (is (some? (t2/update! :model/FieldValues id update-map)))))))

(deftest insert-full-field-values-should-remove-all-cached-field-values
  (doseq [explicitly-full? [false true]]
    (mt/with-temp [:model/FieldValues sandbox-fv {:field_id (mt/id :venues :id)
                                                  :type     :sandbox
                                                  :hash_key "random-hash"}]
      (t2/insert! :model/FieldValues (cond-> {:field_id (mt/id :venues :id)} explicitly-full? (assoc :type :full)))
      (is (not (t2/exists? :model/FieldValues :id (:id sandbox-fv)))))))

(deftest update-full-field-values-should-remove-all-cached-field-values
  (mt/with-temp [:model/FieldValues fv         {:field_id (mt/id :venues :id)
                                                :type     :full}
                 :model/FieldValues sandbox-fv {:field_id (mt/id :venues :id)
                                                :type     :sandbox
                                                :hash_key "random-hash"}]
    (t2/update! :model/FieldValues (:id fv) {:values [1 2 3]})
    (is (not (t2/exists? :model/FieldValues :id (:id sandbox-fv))))))

(deftest update-full-field-without-values-should-remove-not-all-cached-field-values
  (mt/with-temp [:model/FieldValues fv         {:field_id (mt/id :venues :id)
                                                :type     :full}
                 :model/FieldValues sandbox-fv {:field_id (mt/id :venues :id)
                                                :type     :sandbox
                                                :hash_key "random-hash"}]
    (t2/update! :model/FieldValues (:id fv) {:updated_at (t/zoned-date-time)})
    (is (t2/exists? :model/FieldValues :id (:id sandbox-fv)))))

(deftest identity-hash-test
  (testing "Field hashes are composed of the name and the table's identity-hash"
    (mt/with-temp [:model/Database    db    {:name "field-db" :engine :h2}
                   :model/Table       table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                   :model/Field       field {:name "sku" :table_id (:id table)}
                   :model/FieldValues fv    {:field_id (:id field)}]
      (is (= "cb0ff8ea"
             (serdes/raw-hash [(serdes/identity-hash field)])
             (serdes/identity-hash fv))))))

(deftest select-coherence-test
  (testing "We cannot perform queries with invalid mixes of type and hash_key, which would return nothing"
    (let [field-id (mt/id :venues :id)]
      (t2/select :model/FieldValues :field_id field-id)
      (t2/select :model/FieldValues :field_id field-id :type :full)
      (is (thrown-with-msg? ExceptionInfo
                            #"Invalid query - :full FieldValues cannot have a hash_key"
                            (t2/select :model/FieldValues :field_id field-id :type :full :hash_key "12345")))
      (t2/select :model/FieldValues :field_id field-id :type :sandbox)
      (t2/select :model/FieldValues :field_id field-id :type :sandbox :hash_key "12345")
      (is (thrown-with-msg? ExceptionInfo
                            #"Invalid query - Advanced FieldValues can only specify a non-empty hash_key"
                            (t2/select :model/FieldValues :field_id field-id :type :sandbox :hash_key nil))))))

(deftest select-safety-filter-test
  (testing "We do not modify queries that omit type"
    ;; We could push down a WHERE clause to filter mismatched rows, but for performance reasons we do not.
    (is (= {} (#'field-values/add-mismatched-hash-filter {})))
    ;; Is there really a use-case for reading all these values?
    ;; Perhaps we should require a type/hash combo - we would need to be careful it doesn't break any existing queries.
    (is (= {:field_id 1} (#'field-values/add-mismatched-hash-filter {:field_id 1}))))
  ;; There's an argument to be made that we should only query on these "identity" fields if the field-id is present,
  ;; but perhaps there are use cases that I haven't considered.
  (testing "Queries that fully specify the identity are not mangled"
    (is (= {:type :full, :hash_key nil} (#'field-values/add-mismatched-hash-filter {:type :full, :hash_key nil})))
    (is (= {:type :sandbox, :hash_key "random-hash"} (#'field-values/add-mismatched-hash-filter {:type :sandbox, :hash_key "random-hash"}))))
  (testing "Ambiguous queries are upgraded to ensure invalid rows are filtered"
    (is (= {:type :full, :hash_key nil} (#'field-values/add-mismatched-hash-filter {:type :full})))
    (is (= {:type :sandbox, :hash_key [:not= nil]} (#'field-values/add-mismatched-hash-filter {:type :sandbox})))))

;;; ----------------------------------- limit-values ------------------------------------

(deftest ^:parallel limit-values-empty-test
  (is (= {:values [] :has_more_values false} (field-values/limit-values []))))

(deftest ^:parallel limit-values-keeps-nils-test
  (testing "nil is a meaningful distinct value (sorts first); only deduplicated, not dropped"
    (is (= {:values [nil "a" "b"] :has_more_values false}
           (field-values/limit-values [nil "a" nil "b" nil])))))

(deftest ^:parallel limit-values-dedupes-and-sorts-test
  (is (= {:values [1 2 3] :has_more_values false}
         (field-values/limit-values [3 1 2 1 3 2])))
  (is (= {:values ["a" "b" "c"] :has_more_values false}
         (field-values/limit-values ["b" "a" "c" "a"]))))

(deftest limit-values-applies-char-cap-test
  (binding [field-values/*total-max-length* 10]
    (testing "Values fitting under the cap come through unchanged"
      (is (= {:values ["ab" "cd" "ef"] :has_more_values false}
             (field-values/limit-values ["ab" "cd" "ef"]))))
    (testing "Values exceeding the cap trigger has_more_values=true"
      (let [{:keys [values has_more_values]} (field-values/limit-values
                                              ["aaa" "bbb" "ccc" "ddddd" "eeeee" "fffff"])]
        (is (true? has_more_values))
        (is (< (transduce (map (comp count str)) + 0 values) 11)
            "Returned values' total char length stays under the cap")))))

;;; ----------------------------------- persist-field-values! ----------------------------

(deftest persist-field-values!-creates-test
  (testing "nil existing-fv → ::fv-created and a row is written"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}]
      (is (= ::field-values/fv-created
             (field-values/persist-field-values! field nil ["a" "b"])))
      (let [fv (t2/select-one :model/FieldValues :field_id field-id :type :full)]
        (is (= ["a" "b"] (:values fv)))
        (is (false? (:has_more_values fv)))))))

(deftest persist-field-values!-skips-when-unchanged-test
  (testing "Values + has_more_values both match → ::fv-skipped, no DB write"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}
                   :model/FieldValues fv  {:field_id field-id, :type :full, :values ["a" "b"], :has_more_values false}]
      (is (= ::field-values/fv-skipped
             (field-values/persist-field-values! field fv ["a" "b"]))))))

(deftest persist-field-values!-updates-when-values-differ-test
  (testing "Different values → ::fv-updated and the row is rewritten"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}
                   :model/FieldValues fv  {:field_id field-id, :type :full, :values ["a"], :has_more_values false}]
      (is (= ::field-values/fv-updated
             (field-values/persist-field-values! field fv ["a" "b" "c"])))
      (is (= ["a" "b" "c"]
             (:values (t2/select-one :model/FieldValues :field_id field-id :type :full)))))))

(deftest persist-field-values!-updates-when-row-cap-hits-test
  (testing "Raw count hits the warehouse row LIMIT → has_more_values flips to true → ::fv-updated"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}
                   :model/FieldValues fv  {:field_id field-id, :type :full, :values ["a" "b"], :has_more_values false}]
      (binding [field-values/*distinct-limit* 2]
        (is (= ::field-values/fv-updated
               (field-values/persist-field-values! field fv ["a" "b"])))
        (is (true? (:has_more_values (t2/select-one :model/FieldValues :field_id field-id :type :full))))))))

(deftest persist-field-values!-updates-when-char-cap-hits-test
  (testing "Char-length cap fires inside limit-values → has_more_values flips to true → ::fv-updated"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}
                   :model/FieldValues fv  {:field_id field-id, :type :full, :values ["aaa"], :has_more_values false}]
      (binding [field-values/*total-max-length* 4]
        (is (= ::field-values/fv-updated
               (field-values/persist-field-values! field fv ["aaa" "bbb" "ccc"])))
        (is (true? (:has_more_values (t2/select-one :model/FieldValues :field_id field-id :type :full))))))))

(deftest persist-field-values!-deletes-when-empty-test
  (testing "Empty raw-values → ::fv-deleted and the FieldValues row is removed"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table    {tbl-id :id} {:db_id db-id, :name "t"}
                   :model/Field    {field-id :id :as field} {:table_id tbl-id, :name "f"
                                                             :has_field_values :list}
                   :model/FieldValues _  {:field_id field-id, :type :full, :values ["a"], :has_more_values false}]
      (is (= ::field-values/fv-deleted
             (field-values/persist-field-values! field {:id 1 :values ["a"] :has_more_values false} [])))
      (is (false? (t2/exists? :model/FieldValues :field_id field-id :type :full))))))

;;; ---------------------------------- UNION DISTINCT primitive ----------------------------------

(defn- sql-test-drivers
  "Normal drivers that generate SQL. `run-distinct-batch` builds and runs a SQL query, so it
  only applies to SQL drivers — non-SQL drivers (e.g. Mongo) go through the per-field fallback
  at the sync layer and aren't exercised by these direct-call tests."
  []
  (into #{}
        (filter #(isa? driver/hierarchy % :sql))
        (mt/normal-drivers-with-feature :basic-aggregations)))

(deftest decode-value-test
  (testing "nil passes through"
    (is (nil? (#'distinct-batch/decode-value :type/Text nil)))
    (is (nil? (#'distinct-batch/decode-value :type/Integer nil)))
    (is (nil? (#'distinct-batch/decode-value :type/Float nil))))
  (testing "Text base-type → string passthrough"
    (is (= "hello" (#'distinct-batch/decode-value :type/Text "hello")))
    (is (= "" (#'distinct-batch/decode-value :type/Text ""))))
  (testing "Integer base-type → Long"
    (is (= 42 (#'distinct-batch/decode-value :type/Integer "42")))
    (is (= -1 (#'distinct-batch/decode-value :type/Integer "-1"))))
  (testing "BigInteger overflow → BigInteger"
    (is (= 12345678901234567890N
           (#'distinct-batch/decode-value :type/Integer "12345678901234567890")))
    (is (= 12345678901234567890N
           (#'distinct-batch/decode-value :type/BigInteger "12345678901234567890"))))
  (testing "Boolean accepts true/t/1 (case-insensitive)"
    (is (true?  (#'distinct-batch/decode-value :type/Boolean "true")))
    (is (true?  (#'distinct-batch/decode-value :type/Boolean "TRUE")))
    (is (true?  (#'distinct-batch/decode-value :type/Boolean "True")))
    (is (true?  (#'distinct-batch/decode-value :type/Boolean "t")))
    (is (true?  (#'distinct-batch/decode-value :type/Boolean "1")))
    (is (false? (#'distinct-batch/decode-value :type/Boolean "false")))
    (is (false? (#'distinct-batch/decode-value :type/Boolean "FALSE")))
    (is (false? (#'distinct-batch/decode-value :type/Boolean "f")))
    (is (false? (#'distinct-batch/decode-value :type/Boolean "0"))))
  (testing "Float base-type → Double"
    (is (= 3.14   (#'distinct-batch/decode-value :type/Float "3.14")))
    (is (= -0.5   (#'distinct-batch/decode-value :type/Float "-0.5")))
    (is (= 0.0    (#'distinct-batch/decode-value :type/Float "0")))
    (is (= 1.0e10 (#'distinct-batch/decode-value :type/Float "1.0E10"))))
  (testing "Decimal base-type → BigDecimal (Decimal isa Float, so must come first in the cond)"
    (is (= 3.14M           (#'distinct-batch/decode-value :type/Decimal "3.14")))
    (is (= 0M              (#'distinct-batch/decode-value :type/Decimal "0")))
    (is (= 1234567890.123M (#'distinct-batch/decode-value :type/Decimal "1234567890.123"))))
  (testing "Decimal-derived semantic types (e.g. :type/Currency) → BigDecimal"
    (is (= 19.99M (#'distinct-batch/decode-value :type/Currency "19.99"))))
  (testing "Float-derived non-decimal types (e.g. :type/Coordinate) → Double"
    (is (= 37.5 (#'distinct-batch/decode-value :type/Coordinate "37.5"))))
  (testing "Malformed numeric input → string passthrough via catch"
    (is (= "n/a" (#'distinct-batch/decode-value :type/Integer "n/a")))
    (is (= "n/a" (#'distinct-batch/decode-value :type/Float "n/a")))
    (is (= "n/a" (#'distinct-batch/decode-value :type/Decimal "n/a"))))
  (testing "Types we don't decode (already JSON-encoded as strings by mi/transform-json) → string passthrough"
    (is (= "2024-01-15"          (#'distinct-batch/decode-value :type/Date "2024-01-15")))
    (is (= "2024-01-15T10:30:00" (#'distinct-batch/decode-value :type/DateTime "2024-01-15T10:30:00")))
    (is (= "10:30:00"            (#'distinct-batch/decode-value :type/Time "10:30:00")))
    (is (= "abc-def-1234"        (#'distinct-batch/decode-value :type/UUID "abc-def-1234")))
    (is (= "192.168.1.1"         (#'distinct-batch/decode-value :type/IPAddress "192.168.1.1"))))
  (testing "Unknown base-type → string passthrough"
    (is (= "anything" (#'distinct-batch/decode-value :type/SomeMadeUpType "anything")))))

(deftest ^:mb/driver-tests run-distinct-batch-integration-test
  (testing "run-distinct-batch returns correct distinct values for each field"
    (mt/test-drivers (sql-test-drivers)
      (mt/dataset test-data
        (let [table   (t2/select-one :model/Table :id (mt/id :people))
              fields  [(t2/select-one :model/Field :id (mt/id :people :state))
                       (t2/select-one :model/Field :id (mt/id :people :source))]
              results (distinct-batch/run-distinct-batch table fields)]
          (is (map? results) "Returns a map keyed by field-id")
          (is (= (set (map :id fields)) (set (keys results))))
          (testing "people.state distinct values"
            (let [{:keys [values raw-count]} (get results (mt/id :people :state))]
              (is (pos? raw-count))
              (is (every? string? values))
              (is (every? #(= 2 (count %)) values) "US state abbreviations are 2-char")))
          (testing "people.source distinct values"
            (let [{:keys [values]} (get results (mt/id :people :source))]
              (is (seq values))
              (is (every? string? values)))))))))

(deftest ^:mb/driver-tests run-distinct-batch-matches-per-field-test
  (testing "run-distinct-batch returns the same value set per column as the per-field DISTINCT path"
    ;; Cover Text (state), Boolean-shaped low-cardinality (source), and Float (rating). Only fields whose
    ;; distinct count is below the per-column LIMIT — for columns that hit the cap, both paths return a
    ;; valid subset but the warehouse is free to pick *which* 1000, and the subsets may differ across
    ;; paths/engines without either being wrong.
    (mt/test-drivers (sql-test-drivers)
      (mt/dataset test-data
        (let [people-table   (t2/select-one :model/Table :id (mt/id :people))
              products-table (t2/select-one :model/Table :id (mt/id :products))
              text-fields    (mapv #(t2/select-one :model/Field :id (mt/id :people %)) [:state :source])
              float-fields   (mapv #(t2/select-one :model/Field :id (mt/id :products %)) [:rating])
              expected-set   (fn [f] (set (map first (-> (field-values/distinct-values f) :values))))
              per-field-results (into {} (map (fn [f] [(:id f) (expected-set f)])) (concat text-fields float-fields))
              people-results    (distinct-batch/run-distinct-batch people-table text-fields)
              products-results  (distinct-batch/run-distinct-batch products-table float-fields)
              union-results     (merge people-results products-results)]
          (doseq [field (concat text-fields float-fields)]
            (testing (format "field %s (%s)" (:name field) (name (:base_type field)))
              (let [expected (get per-field-results (:id field))
                    actual   (set (:values (get union-results (:id field))))]
                (is (= expected actual)
                    (format "UNION distinct values differ from per-field DISTINCT for %s on %s"
                            (:name field) (name driver/*driver*)))))))))))

(deftest ^:mb/driver-tests run-distinct-batch-cross-driver-test
  (testing "run-distinct-batch produces correct results on every supported SQL driver"
    (mt/test-drivers (sql-test-drivers)
      (mt/dataset test-data
        (let [table        (t2/select-one :model/Table :id (mt/id :people))
              state-field  (t2/select-one :model/Field :id (mt/id :people :state))
              source-field (t2/select-one :model/Field :id (mt/id :people :source))
              results      (distinct-batch/run-distinct-batch table [state-field source-field])]
          (testing "Result map is keyed by field-id with :values / :raw-count entries"
            (is (map? results))
            (is (= #{(:id state-field) (:id source-field)} (set (keys results)))))
          (testing "Returned values are non-empty Clojure values, not raw JDBC objects"
            (let [{:keys [values]} (get results (:id state-field))]
              (is (pos? (count values)))
              (is (every? string? values)
                  (str "state-field values should decode to strings, got: " (pr-str (take 3 values))))))
          (testing "Sources column returns a small distinct set"
            (let [{:keys [values raw-count]} (get results (:id source-field))]
              (is (< raw-count field-values/*distinct-limit*)
                  "source has few enough distinct values to not hit the LIMIT")
              (is (every? string? values)))))))))
