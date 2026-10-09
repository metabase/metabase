(ns metabase-enterprise.data-sensitivity.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.database-routing.core :as database-routing]
   [metabase.driver :as driver]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(defn- table-packet
  "Build the packet as a superuser."
  [table & {:as opts}]
  (mt/with-current-user (mt/user->id :crowberto)
    (context/table-packet (t2/select-one :model/Database :id (:db_id table)) table opts)))

(defn- people-table []
  (t2/select-one :model/Table :id (mt/id :people)))

(defn- field-by-name [packet field-name]
  (some #(when (= field-name (:name %)) %) (:fields packet)))

(defn- schema-only-packet [table]
  (table-packet table :include-values? false))

(deftest field-selection-test
  (mt/with-temp [:model/Field hidden  {:table_id (mt/id :people) :name "hidden_f" :base_type :type/Text
                                       :visibility_type :hidden :position 100}
                 :model/Field retired {:table_id (mt/id :people) :name "retired_f" :base_type :type/Text
                                       :visibility_type :retired :position 101}
                 :model/Field inact   {:table_id (mt/id :people) :name "inactive_f" :base_type :type/Text
                                       :active false :position 102}]
    (let [packet (schema-only-packet (people-table))
          ids    (into #{} (map :id) (:fields packet))]
      (testing "hidden fields are included"
        (is (contains? ids (:id hidden))))
      (testing "retired and inactive fields are excluded"
        (is (not (contains? ids (:id retired))))
        (is (not (contains? ids (:id inact)))))
      (testing "fields are ordered by position then id"
        (is (= (sort-by (juxt :position :id) (:fields packet))
               (:fields packet)))))))

(deftest json-child-fields-excluded-test
  (mt/with-temp [:model/Field sql-parent  {:table_id (mt/id :people) :name "payload" :base_type :type/JSON
                                           :position 100}
                 :model/Field sql-child   {:table_id (mt/id :people) :name "payload → user → email"
                                           :base_type :type/Text :nfc_path ["payload" "user" "email"] :position 101}
                 :model/Field mongo-child {:table_id (mt/id :people) :name "email" :base_type :type/Text
                                           :parent_id (:id sql-parent) :nfc_path ["payload" "email"] :position 102}]
    (let [sampled-ids (atom nil)
          packet      (with-redefs [driver/table-rows-sample
                                    (fn [_driver _table sample-fields _rff _opts]
                                      (reset! sampled-ids (set (map :id sample-fields)))
                                      [])]
                        (table-packet (people-table)))
          ids         (into #{} (map :id) (:fields packet))]
      (testing "the JSON parent column is classified as one field"
        (is (contains? ids (:id sql-parent))))
      (testing "child fields with nfc_path only or with parent_id are excluded from the packet"
        (is (not (contains? ids (:id sql-child))))
        (is (not (contains? ids (:id mongo-child)))))
      (testing "the row sample selects the parent and no child paths"
        (is (contains? @sampled-ids (:id sql-parent)))
        (is (not (contains? @sampled-ids (:id sql-child))))
        (is (not (contains? @sampled-ids (:id mongo-child))))))))

(deftest table-block-test
  (let [table  (people-table)
        packet (schema-only-packet table)]
    (is (= {:id     (:id table)
            :name   (:name table)
            :schema (:schema table)
            :db_id  (mt/id)
            :engine :h2}
           (select-keys (:table packet) [:id :name :schema :db_id :engine])))
    (is (= 0 (get-in packet [:sample :rows])))
    (is (nil? (get-in packet [:sample :error])))))

(deftest human-set-flags-test
  (mt/with-temp [:model/Field {field-id :id :as f} {:table_id (mt/id :people) :name "labeled_f" :base_type :type/Text
                                                    :data_sensitivity :PII :description "Comment from the database"}]
    (testing "a field with no user-settings row has no human-set keys"
      (let [entry (field-by-name (schema-only-packet (people-table)) "labeled_f")]
        (is (= #{} (:human_set entry)))
        (is (= {:data_sensitivity :PII :human_set false} (:current entry)))))
    (testing "a field with no user-settings row shows the Field's description"
      (is (= "Comment from the database" (:description (field-by-name (schema-only-packet (people-table)) "labeled_f")))))
    (testing "non-nil user-settings values and a cleared flagged column are reported as human-set"
      (field-user-settings/upsert-user-settings f {:semantic_type :type/Email :data_sensitivity :PUBLIC :description nil})
      (let [entry (field-by-name (schema-only-packet (people-table)) "labeled_f")]
        (is (= #{:semantic_type :data_sensitivity :description} (:human_set entry)))
        (is (nil? (:description entry)) "a cleared description hides the Field's description, as the overlay does")
        (is (= {:data_sensitivity :PUBLIC :human_set true} (:current entry)))
        (is (= :type/Email (:semantic_type entry))))
      (is (= :PUBLIC (t2/select-one-fn :data_sensitivity :model/FieldUserSettings :field_id field-id))))))

(deftest fk-target-test
  (let [packet   (schema-only-packet (t2/select-one :model/Table :id (mt/id :orders)))
        people   (people-table)
        expected (str/join "." (remove nil? [(:schema people) (:name people)
                                             (t2/select-one-fn :name :model/Field :id (mt/id :people :id))]))]
    (is (= expected (:fk_target (field-by-name packet (t2/select-one-fn :name :model/Field :id (mt/id :orders :user_id))))))
    (is (nil? (:fk_target (field-by-name packet (t2/select-one-fn :name :model/Field :id (mt/id :orders :total))))))))

(deftest fingerprint-summary-test
  (let [summary #'context/fingerprint-summary]
    (testing "nil fingerprint yields nil"
      (is (nil? (summary nil))))
    (testing "percentages and averages round to two decimals, integers pass through"
      (is (= {:distinct_count 10
              :nil_pct        0.12
              :text           {:percent-email 0.99 :average-length 12.35}}
             (summary {:global {:distinct-count 10 :nil% 0.123456}
                       :type   {:type/Text {:percent-email 0.98765 :average-length 12.3456 :mode-fraction 0.5}}})))
      (is (= {:number {:min 1 :max 100 :avg 33.33}}
             (summary {:type {:type/Number {:min 1 :max 100 :avg 33.3333 :sd 2.0}}}))))
    (testing "temporal bounds are kept as-is"
      (is (= {:temporal {:earliest "2020-01-01T00:00:00Z" :latest "2021-01-01T00:00:00Z"}}
             (summary {:type {:type/DateTime {:earliest "2020-01-01T00:00:00Z" :latest "2021-01-01T00:00:00Z"}}}))))
    (testing "a fingerprint with nothing useful yields nil"
      (is (nil? (summary {:global {}}))))))

(deftest cached-values-cap-test
  (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :people) :name "cached_f" :base_type :type/Text}
                 :model/FieldValues _ {:field_id field-id :type :full
                                       :values (into ["dup" "dup" nil] (map #(str "v" %) (range 20)))}]
    (with-redefs [driver/table-rows-sample (fn [& _] [])]
      (let [entry (field-by-name (table-packet (people-table) :cached-values-cap 5) "cached_f")]
        (testing "cached values are distinct, non-nil, and capped"
          (is (= ["dup" "v0" "v1" "v2" "v3"] (:cached_values entry))))
        (testing "an empty row sample yields empty sample values, not an error"
          (is (= [] (:sample_values entry))))))))

(deftest sample-values-test
  (let [table         (people-table)
        sampled-ids   (atom nil)]
    (with-redefs [driver/table-rows-sample
                  (fn [_driver _table sample-fields _rff _opts]
                    (reset! sampled-ids (map :id sample-fields))
                    (vec (for [i (range 12)]
                           (vec (repeat (count sample-fields) (when (odd? i) (str "value-" (quot i 2))))))))]
      (let [packet (table-packet table :sample-values-cap 4 :truncation 7)]
        (testing "the sampler receives the packet's fields in packet order"
          (is (= (map :id (:fields packet)) @sampled-ids)))
        (testing "every field gets the transposed column, nils dropped, distinct, capped, truncated"
          (is (seq (:fields packet)))
          (is (every? #(= ["value-0" "value-1" "value-2" "value-3"] (:sample_values %)) (:fields packet))))
        (is (= {:rows 10 :truncation 7 :error nil} (:sample packet)))))))

(deftest real-sample-test
  (testing "the row sample runs through the query processor against the test warehouse"
    (let [packet (table-packet (people-table) :sample-rows 5)
          email  (field-by-name packet (t2/select-one-fn :name :model/Field :id (mt/id :people :email)))]
      (is (nil? (get-in packet [:sample :error])))
      (is (<= 1 (count (:sample_values email)) 5))
      (is (every? #(str/includes? % "@") (:sample_values email))))))

(deftest include-values-false-test
  (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :people) :name "cached_f" :base_type :type/Text}
                 :model/FieldValues _ {:field_id field-id :type :full :values ["cached-marker"]}]
    (let [table   (people-table)
          with    (with-redefs [driver/table-rows-sample
                                (fn [_ _ fields _ _] [(vec (repeat (count fields) "sampled-marker"))])]
                    (table-packet table))
          without (with-redefs [driver/table-rows-sample (fn [& _] (throw (ex-info "must not sample" {})))]
                    (schema-only-packet table))]
      (testing "with values on, cached and sampled values reach the packet"
        (is (str/includes? (pr-str with) "cached-marker"))
        (is (str/includes? (pr-str with) "sampled-marker")))
      (testing "with values off the sampler is not called, no field carries values, and no value string reaches the packet"
        (is (nil? (get-in without [:sample :error])))
        (is (every? #(and (nil? (:cached_values %)) (nil? (:sample_values %))) (:fields without)))
        (is (not (str/includes? (pr-str without) "cached-marker")))
        (is (not (str/includes? (pr-str without) "sampled-marker")))))))

(deftest sample-error-test
  (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :people) :name "cached_f" :base_type :type/Text}
                 :model/FieldValues _ {:field_id field-id :type :full :values ["cached-marker"]}]
    (with-redefs [driver/table-rows-sample (fn [& _] (throw (ex-info "warehouse unreachable" {})))]
      (let [packet (table-packet (people-table))]
        (testing "a failing row sample is recorded and the packet still builds"
          (is (= "warehouse unreachable" (get-in packet [:sample :error])))
          (is (pos? (count (:fields packet))))
          (is (every? #(nil? (:sample_values %)) (:fields packet))))
        (testing "cached values are unaffected by the sample failure"
          (is (= ["cached-marker"] (:cached_values (field-by-name packet "cached_f")))))))))

(deftest nil-option-uses-default-test
  (let [sample-opts (atom nil)]
    (with-redefs [driver/table-rows-sample (fn [_ _ _ _ opts] (reset! sample-opts opts) [])]
      (let [packet (table-packet (people-table) :include-values? nil :sample-rows nil :truncation nil
                                 :sample-values-cap nil :cached-values-cap nil)]
        (testing "an explicit nil option takes its default"
          (is (= {:rows 10 :truncation 500 :error nil} (:sample packet)))
          (is (= {:limit 10 :truncation-size 500} @sample-opts)))))))

(deftest cached-values-read-only-test
  (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :people) :name "cached_f" :base_type :type/Text}
                 :model/FieldValues _ {:field_id field-id :type :full :values ["older"]
                                       :updated_at #t "2020-01-01T00:00:00Z"}
                 :model/FieldValues _ {:field_id field-id :type :full :values ["newer"]
                                       :updated_at #t "2021-01-01T00:00:00Z"}]
    (with-redefs [driver/table-rows-sample (fn [& _] [])]
      (let [entry (field-by-name (table-packet (people-table)) "cached_f")]
        (testing "the most recently updated FieldValues row is used"
          (is (= ["newer"] (:cached_values entry))))
        (testing "shadowed duplicate FieldValues rows are left in place"
          (is (= 2 (t2/count :model/FieldValues :field_id field-id :type :full))))))))

(defn- current-user-packet!
  "Build the packet of the people table as the current user, with a cached marker value on a temp field and a sampler
  that answers with a sampled marker. Returns the packet and the number of sampler calls."
  []
  (mt/with-temp [:model/Field {field-id :id} {:table_id (mt/id :people) :name "cached_f" :base_type :type/Text}
                 :model/FieldValues _ {:field_id field-id :type :full :values ["cached-marker"]}]
    (let [samples (atom 0)
          packet  (with-redefs [driver/table-rows-sample (fn [_ _ fields _ _]
                                                           (swap! samples inc)
                                                           [(vec (repeat (count fields) "sampled-marker"))])]
                    (context/table-packet (t2/select-one :model/Database :id (mt/id))
                                          (t2/select-one :model/Table :id (mt/id :people))))]
      {:packet packet :samples @samples})))

(defn- values-sent? [packet]
  (let [s (pr-str packet)]
    (and (str/includes? s "cached-marker") (str/includes? s "sampled-marker"))))

(defn- metadata-only? [{:keys [packet samples]}]
  (and (zero? samples)
       (zero? (get-in packet [:sample :rows]))
       (pos? (count (:fields packet)))
       (every? #(and (nil? (:cached_values %)) (nil? (:sample_values %))) (:fields packet))
       (not (str/includes? (pr-str packet) "-marker"))))

(deftest values-permissions-test
  (testing "a superuser gets cached and sampled values"
    (let [{:keys [packet samples]} (mt/with-current-user (mt/user->id :crowberto) (current-user-packet!))]
      (is (= 1 samples))
      (is (values-sent? packet))
      (is (nil? (get-in packet [:sample :error])))))
  (testing "a user who may query the whole table gets cached and sampled values"
    (let [{:keys [packet]} (mt/with-current-user (mt/user->id :rasta) (current-user-packet!))]
      (is (values-sent? packet))
      (is (nil? (get-in packet [:sample :error])))))
  (testing "a user with blocked view-data on the table gets no values and the reason"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-no-data-perms-for-all-users!
        (mt/with-perm-for-group-and-table! (perms/all-users-group) (mt/id :people) :perms/view-data :blocked
          (let [result (mt/with-current-user (mt/user->id :rasta) (current-user-packet!))]
            (is (metadata-only? result))
            (is (= "the current user cannot query this table" (get-in result [:packet :sample :error]))))))))
  (testing "with no current user no values are read"
    (let [result (current-user-packet!)]
      (is (metadata-only? result))
      (is (= "the current user cannot query this table" (get-in result [:packet :sample :error]))))))

(deftest values-sandboxed-test
  (testing "a user with a sandbox on the table gets no values and the reason"
    (met/with-gtaps! {:gtaps {:people {}}}
      (let [result (current-user-packet!)]
        (is (metadata-only? result))
        (is (= "a sandbox applies to this table for the current user" (get-in result [:packet :sample :error])))))))

(deftest values-impersonated-test
  (testing "a user with an enforced impersonation on the database gets no values and the reason"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                     :attributes     {"impersonation_attr" "impersonation_role"}}
        (let [result (current-user-packet!)]
          (is (metadata-only? result))
          (is (= "connection impersonation applies to this database for the current user"
                 (get-in result [:packet :sample :error]))))))))

(deftest values-routed-database-test
  (mt/with-dynamic-fn-redefs [database-routing/db-routing-enabled? (constantly true)]
    (testing "a non-superuser on a routed database gets no values and the reason"
      (let [result (mt/with-current-user (mt/user->id :rasta) (current-user-packet!))]
        (is (metadata-only? result))
        (is (= "this database uses database routing" (get-in result [:packet :sample :error])))))
    (testing "a superuser on a routed database gets values"
      (is (values-sent? (:packet (mt/with-current-user (mt/user->id :crowberto) (current-user-packet!))))))))
