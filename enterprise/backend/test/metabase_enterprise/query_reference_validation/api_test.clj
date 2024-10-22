(ns metabase-enterprise.query-reference-validation.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.query-analysis :as query-analysis]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- do-with-test-setup! [f]
  (query-analysis/without-analysis
   (t2.with-temp/with-temp [:model/Table      {table-1 :id}  {:name "T1"}
                            :model/Table      {table-2 :id}  {:name "T2" :active false}
                            ;; no coll-1; its card is in the root collection
                            :model/Collection {coll-2 :id}   {:name "ZZY"}
                            :model/Collection {coll-3 :id}   {:name "ZZZ" :location (str "/" coll-2 "/")}
                            :model/Card       {card-1 :id}   {:name "A"}
                            :model/Card       {card-2 :id}   {:name "B" :collection_id coll-2}
                            :model/Card       {card-3 :id}   {:name "C" :collection_id coll-3}
                            :model/Card       {card-4 :id}   {:name "D"}
                            :model/Card       {card-5 :id}   {:name "E"}
                            :model/Field      {field-1 :id}  {:active   false
                                                              :name     "FA"
                                                              :table_id table-1}
                            :model/Field      {field-2 :id}  {:active   false
                                                              :name     "FB"
                                                              :table_id table-2}

                            :model/QueryAnalysis {qa-1 :id}  {:card_id card-1}
                            :model/QueryAnalysis {qa-2 :id}  {:card_id card-2}
                            :model/QueryAnalysis {qa-3 :id}  {:card_id card-3}
                            :model/QueryAnalysis {qa-5 :id}  {:card_id card-5}

                            ;; QTs not to include:
                            ;; - Table is still active
                            :model/QueryTable {}             {:card_id     card-1
                                                              :analysis_id qa-1
                                                              :table       "ORDERS"
                                                              :table_id    (mt/id :orders)}

                            :model/QueryTable {}              {:card_id     card-1
                                                               :analysis_id qa-1
                                                               :table       "T1"
                                                               :table_id    table-1}
                            :model/QueryTable {}              {:card_id     card-2
                                                               :analysis_id qa-2
                                                               :table       "T2"
                                                               :table_id    table-2}
                            :model/QueryTable {}              {:card_id     card-3
                                                               :analysis_id qa-3
                                                               :table       "T3"
                                                               :table_id    nil}
                            :model/QueryTable {}              {:card_id     card-5
                                                               :analysis_id qa-5
                                                               :table       "T5"
                                                               :table_id    nil}

                            ;; QFs not to include:
                            ;; - Field is still active
                            :model/QueryField {}             {:card_id     card-1
                                                              :analysis_id qa-1
                                                              :table       "ORDERS"
                                                              :column      "tax"
                                                              :table_id    (mt/id :orders)
                                                              :field_id    (mt/id :orders :tax)}
                            ;; - Implicit reference
                            :model/QueryField {}             {:card_id            card-2
                                                              :analysis_id        qa-2
                                                              :table              "T1"
                                                              :column             "FA"
                                                              :table_id           table-1
                                                              :field_id           field-1
                                                              :explicit_reference false}

                            ;; - No resolved table, probably an imaginary column due to Macaw bugs
                            :model/QueryField {}             {:card_id            card-3
                                                              :analysis_id        qa-3
                                                              :table              nil
                                                              :column             "FALSE"
                                                              :table_id           nil
                                                              :field_id           nil
                                                              :explicit_reference true}

                            ;; QFs to include:
                            :model/QueryField {}             {:card_id     card-1
                                                              :analysis_id qa-1
                                                              :table       "T1"
                                                              :column      "FA"
                                                              :table_id    table-1
                                                              :field_id    field-1}
                            :model/QueryField {}             {:card_id     card-1
                                                              :analysis_id qa-1
                                                              :table       "T1"
                                                              :column      "FAB"
                                                              :table_id    table-1
                                                              :field_id    nil}
                            :model/QueryField {}             {:card_id     card-2
                                                              :analysis_id qa-2
                                                              :table       "T2"
                                                              :column      "FB"
                                                              :table_id    table-2
                                                              :field_id    field-2}
                            :model/QueryField {}             {:card_id     card-2
                                                              :analysis_id qa-2
                                                              :table       "T2"
                                                              :column      "FBB"
                                                              :table_id    table-2
                                                              :field_id    nil}
                            :model/QueryField {}             {:card_id     card-3
                                                              :analysis_id qa-3
                                                              :table       "T3"
                                                              :column      "FC"
                                                              :table_id    nil
                                                              :field_id    nil}]
     (mt/with-premium-features #{:query-reference-validation}
       (mt/with-temporary-setting-values [query-analysis-enabled true]
         (mt/call-with-map-params f [card-1 card-2 card-3 card-4 card-5 coll-2 coll-3]))))))

(defmacro ^:private with-test-setup!
  "Creates some non-stale QueryFields and anaphorically provides stale QueryField IDs called `qf-{1-3}` and `qf-1b` and
  their corresponding Card IDs (`card-{1-3}`). The cards are named A, B, and C. The Fields are called FA, FB, FB and
  they all point to a Table called T. Both `qf-1` and `qf-1b` refer to `card-1`.

  `card-4` is guaranteed not to have problems"
  [& body]
  `(do-with-test-setup!
    (mt/with-anaphora [card-1 card-2 card-3 card-4 card-5 coll-2 coll-3]
      ~@body)))

(def ^:private url "ee/query-reference-validation/invalid-cards")

(defn- get!
  ([] (get! {}))
  ([params]
   (mt/user-http-request :crowberto :get 200 (str url "?" (codec/form-encode params)))))

(deftest collection-ancestors-test
  (testing "The response includes collection ancestors"
    (with-test-setup!
      (is (= [{:collection {:id nil
                            :name nil
                            :authority_level nil
                            :type nil
                            :effective_ancestors []}}
              {:collection {:id coll-2
                            :name (t2/select-one-fn :name :model/Collection :id coll-2)
                            :authority_level nil
                            :type nil
                            :effective_ancestors [{:id "root" :name "Our analytics" :authority_level nil}]}}
              {:collection {:id coll-3
                            :name (t2/select-one-fn :name :model/Collection :id coll-3)
                            :authority_level nil
                            :type nil
                            :effective_ancestors [{:id "root" :name "Our analytics" :authority_level nil}
                                                  {:id coll-2
                                                   :name (t2/select-one-fn :name :model/Collection :id coll-2)
                                                   :type nil}]}}
              {:collection {:id nil
                            :name nil
                            :authority_level nil
                            :type nil
                            :effective_ancestors []}}]
             (map #(select-keys % [:collection]) (:data (get!))))))))

(deftest premium-feature-test
  (testing "It requires the premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error "Query Reference Validation"
                                           (mt/user-http-request :crowberto :get 402 url)))))

(defn- with-data-keys [{:keys [data] :as resp} ks]
  (assoc resp :data (map (fn [d] (select-keys d ks)) data)))

(deftest setting-test
  (testing "It requires the query analysis setting"
    (with-test-setup!
      (mt/with-temporary-setting-values [query-analysis-enabled false]
        (is (= "Query Analysis must be enabled to use the Query Reference Validator"
               (mt/user-http-request :crowberto :get 429 url)))))))

(deftest list-invalid-cards-basic-test
  (testing "Only returns cards with problematic field refs"
    (with-test-setup!
      (is (= {:total 4
              :data
              [{:id     card-1
                :name   "A"
                :errors [{:type "inactive-field", :table "T1", :field "FA"}
                         {:type "unknown-field", :table "T1", :field "FAB"}]}
               {:id     card-2
                :name   "B"
                :errors [{:type "inactive-table", :table "T2"}]}
               {:id     card-3
                :name   "C"
                :errors [{:type "unknown-table", :table "T3"}]}
               {:id     card-5
                :name   "E"
                :errors [{:type "unknown-table", :table "T5"}]}]}
             (-> (get!)
                 (select-keys [:data :total])
                 (update :data (fn [data] (map #(select-keys % [:id :name :errors]) data)))))))))

(deftest pagination-test
  (testing "Lets you page results"
    (with-test-setup!
      (is (= {:total  4
              :limit  2
              :offset 0
              :data
              [{:id     card-1
                :name   "A"
                :errors [{:type "inactive-field", :table "T1", :field "FA"}
                         {:type "unknown-field", :table "T1", :field "FAB"}]}
               {:id     card-2
                :name   "B"
                :errors [{:type "inactive-table", :table "T2"}]}]}
             (-> (get! {:limit 2})
                 (select-keys [:total :limit :offset :data])
                 (with-data-keys [:id :name :errors]))))
      (is (= {:total  4
              :limit  3
              :offset 2
              :data
              [{:id     card-3
                :name   "C"
                :errors [{:type "unknown-table", :table "T3"}]}
               {:id    card-5
                :name "E"
                :errors [{:type "unknown-table", :table "T5"}]}]}
             (-> (get! {:limit 3 :offset 2})
                 (select-keys [:total :limit :offset :data])
                 (with-data-keys [:id :name :errors])))))))

(deftest sorting-test
  (testing "Lets you specify the sort key:\n"
    (with-test-setup!
      (testing "collection desc"
        (is (= {:total 4
                :data
                [{:id card-3}
                 {:id card-2}
                 {:id card-5}
                 {:id card-1}]}
               (-> (get! {:sort_column "collection" :sort_direction "desc"})
                   (select-keys [:total :data])
                   (with-data-keys [:id])))))
      (testing "last_edited_at asc"
        (is (= {:total 4
                :data
                [{:id card-1}
                 {:id card-2}
                 {:id card-3}
                 {:id card-5}]}
               (-> (get! {:sort_column "last_edited_at" :sort_direction "asc"})
                   (select-keys [:total :data])
                   (with-data-keys [:id])))))
      (testing "last_edited_at desc"
        (is (= {:total 4
                :data
                [{:id card-5}
                 {:id card-3}
                 {:id card-2}
                 {:id card-1}]}
               (-> (get! {:sort_column "last_edited_at" :sort_direction "desc"})
                   (select-keys [:total :data])
                   (with-data-keys [:id])))))))

  (testing "Rejects bad keys"
    (with-test-setup!
      (is (str/starts-with? (:sort_column
                             (:errors
                              (mt/user-http-request :crowberto :get 400 (str url "?sort_column=favorite_bird"))))
                            "nullable enum of")))))

(deftest filter-on-collection
  (testing "can filter on collection id"
    (with-test-setup!
      (testing "we can just look in coll-3"
        (is (= {:total 1
                :data
                [{:id card-3}]}
               (-> (get! {:collection_id coll-3})
                   (select-keys [:total :data])
                   (with-data-keys [:id])))))
      (testing "we can look in coll-2 (which contains coll-3)"
        (is (= {:total 2
                :data
                [{:id card-2}
                 {:id card-3}]}
               (-> (get! {:collection_id coll-2})
                   (select-keys [:total :data])
                   (with-data-keys [:id])))))
      (testing "we can look in the root coll (which recursively contains coll-2 and coll-3)"
        (is (= {:total 4
                :data
                [{:id card-1}
                 {:id card-2}
                 {:id card-3}
                 {:id card-5}]}
               (-> (get! {})
                   (select-keys [:total :data])
                   (with-data-keys [:id]))))))))

(deftest is-admin-test
  (mt/with-premium-features #{:query-reference-validation}
    (testing "The endpoint is unavailable for normal users"
      (is (mt/user-http-request :rasta :get 403 url)))))

(deftest all-expected-keys-are-present
  (testing "All the expected keys are present"
    (with-test-setup!
      (is (= (repeat 4 #{:archived
                         :collection
                         :collection_id
                         :collection_position
                         :collection_preview
                         :creator
                         :dataset_query
                         :description
                         :display
                         :entity_id
                         :errors
                         :id
                         :last_used_at
                         :name})
             (->> (get! {})
                  :data
                  (map keys)
                  (map set)))))))
