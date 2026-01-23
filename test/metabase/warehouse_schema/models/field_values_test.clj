(ns metabase.warehouse-schema.models.field-values-test
  "Tests for specific behavior related to FieldValues and functions in
  the [[metabase.warehouse-schema.models.field-values]] namespace."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.models.serialization :as serdes]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
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
    (is (= {:values [["Doohickey"] ["Gadget"] ["Gizmo"] ["Widget"]]
            :has_more_values false}
           (distinct-field-values (mt/id :products :category)))))
  (testing "Correctly get distinct field values for non-text fields"
    (is (= {:values [[1] [2] [3] [4] [5]]
            :has_more_values false}
           (distinct-field-values (mt/id :reviews :rating)))))
  (testing "if the values of field exceeds max-char-len, return a subset of it (#2332)"
    (binding [field-values/*total-max-length* 16]
      (is (= {:values          [["Doohickey"] ["Gadget"]]
              :has_more_values true}
             (distinct-field-values (mt/id :products :category)))))
    (binding [field-values/*total-max-length* 3]
      (is (= {:values          [[1] [2] [3]]
              :has_more_values true}
             (distinct-field-values (mt/id :reviews :rating)))))))

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
