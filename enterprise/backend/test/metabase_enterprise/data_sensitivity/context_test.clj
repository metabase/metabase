(ns metabase-enterprise.data-sensitivity.context-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [toucan2.core :as t2]))

(defn- people-table []
  (t2/select-one :model/Table :id (mt/id :people)))

(defn- field-by-name [packet field-name]
  (some #(when (= field-name (:name %)) %) (:fields packet)))

(defn- schema-only-packet [table]
  (context/table-packet table :include-values? false))

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
                                                    :data_sensitivity :PII}]
    (testing "a field with no user-settings row has no human-set keys"
      (let [entry (field-by-name (schema-only-packet (people-table)) "labeled_f")]
        (is (= #{} (:human_set entry)))
        (is (= {:data_sensitivity :PII :human_set? false} (:current entry)))))
    (testing "non-nil user-settings values are reported as human-set"
      (field-user-settings/upsert-user-settings f {:semantic_type :type/Email :data_sensitivity :PUBLIC :description nil})
      (let [entry (field-by-name (schema-only-packet (people-table)) "labeled_f")]
        (is (= #{:semantic_type :data_sensitivity} (:human_set entry)))
        (is (= {:data_sensitivity :PUBLIC :human_set? true} (:current entry)))
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
      (let [entry (field-by-name (context/table-packet (people-table) :cached-values-cap 5) "cached_f")]
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
      (let [packet (context/table-packet table :sample-values-cap 4 :truncation 7)]
        (testing "the sampler receives the packet's fields in packet order"
          (is (= (map :id (:fields packet)) @sampled-ids)))
        (testing "every field gets the transposed column, nils dropped, distinct, capped, truncated"
          (is (seq (:fields packet)))
          (is (every? #(= ["value-0" "value-1" "value-2" "value-3"] (:sample_values %)) (:fields packet))))
        (is (= {:rows 10 :truncation 7 :error nil} (:sample packet)))))))

(deftest real-sample-test
  (testing "the row sample runs through the query processor against the test warehouse"
    (let [packet (context/table-packet (people-table) :sample-rows 5)
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
                    (context/table-packet table))
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
      (let [packet (context/table-packet (people-table))]
        (testing "a failing row sample is recorded and the packet still builds"
          (is (= "warehouse unreachable" (get-in packet [:sample :error])))
          (is (pos? (count (:fields packet))))
          (is (every? #(nil? (:sample_values %)) (:fields packet))))
        (testing "cached values are unaffected by the sample failure"
          (is (= ["cached-marker"] (:cached_values (field-by-name packet "cached_f")))))))))
