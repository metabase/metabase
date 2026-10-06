(ns metabase.queries.models.card.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel populate-result-metadata-normalize-output-test
  (testing "populate-result-metadata should normalize output"
    (let [card {:result_metadata [{:database_type             "BIGINT"
                                   :semantic_type             "type/PK"
                                   :table_id                  10806
                                   :lib/deduplicated-name     "ID"
                                   :lib/original-name         "ID"
                                   :name                      "ID"
                                   :lib/source-column-alias   "ID"
                                   :lib/original-display-name "ID"
                                   :source                    "fields"
                                   :field_ref                 ["field" 61327 nil]
                                   :effective_type            "type/BigInteger"
                                   :active                    true
                                   :id                        61327
                                   :lib/desired-column-alias  "ID"
                                   :position                  0
                                   :visibility_type           "normal"
                                   :display_name              "EDITED DISPLAY"
                                   :base_type                 "type/BigInteger"}]}]
      (is (=? {:result_metadata [{:database_type             "BIGINT"
                                  :semantic_type             :type/PK
                                  :table_id                  10806
                                  :lib/deduplicated-name     "ID"
                                  :lib/original-name         "ID"
                                  :name                      "ID"
                                  :lib/source-column-alias   "ID"
                                  :lib/original-display-name "ID"
                                  :source                    :fields
                                  :field_ref                 [:field 61327 nil]
                                  :effective_type            :type/BigInteger
                                  :active                    true
                                  :id                        61327
                                  :lib/desired-column-alias  "ID"
                                  :position                  0
                                  :visibility_type           :normal
                                  :display_name              "EDITED DISPLAY"
                                  :base_type                 :type/BigInteger}]}
              (card.metadata/populate-result-metadata (lib/normalize ::queries.schema/card card)))))))

(deftest ^:parallel infer-metadata-no-remaps
  (testing "infer-metadata should not include remapped columns (#67128)"
    (mt/with-temp [:model/Dimension _ {:field_id                (mt/id :orders :user_id)
                                       :name                    "User ID"
                                       :human_readable_field_id (mt/id :people :name)
                                       :type                    :external}
                   :model/Dimension _ {:field_id                (mt/id :orders :product_id)
                                       :name                    "Product ID"
                                       :human_readable_field_id (mt/id :products :title)
                                       :type                    :external}]
      (let [mp (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
        (is (= 9 ;; there are two remaps, giving 11 if included
               (count (card.metadata/infer-metadata query))))))))

(deftest ^:parallel untyped-metadata?-test
  (testing "metadata is untyped when it has columns and none of them has a known base type (GHY-4213)"
    (are [expected metadata] (= expected (card.metadata/untyped-metadata? metadata))
      true  [{:name "A"} {:name "B" :base_type :type/*}]
      false [{:name "A" :base_type :type/*} {:name "B" :base_type :type/Integer}]
      false [{:name "A" :base_type :type/Text}]
      false []
      false nil)))

(defn- venues-query []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(deftest backfill-untyped-model-metadata!-test
  (testing "backfill-untyped-model-metadata! infers the untyped metadata of the models on a database (GHY-4213)"
    (mt/with-temp [:model/Table {inactive-table-id :id} {:db_id (mt/id) :name "GHY_4213_NOT_SYNCED" :active false}
                   :model/Card {untyped-id :id} {:type            :model
                                                 :dataset_query   (venues-query)
                                                 :result_metadata [{:name "NAME" :display_name "Venue Name" :base_type :type/*}]}
                   :model/Card {typed-id :id} {:type            :model
                                               :dataset_query   (venues-query)
                                               :result_metadata [{:name "NAME" :display_name "Typed" :base_type :type/Text}]}
                   :model/Card {unresolvable-id :id} {:type            :model
                                                      :dataset_query   {:database (mt/id)
                                                                        :type     :query
                                                                        :query    {:source-table inactive-table-id}}
                                                      :result_metadata [{:name "NAME" :base_type :type/*}]}]
      (let [metadata (fn [card-id]
                       (:result_metadata (t2/select-one [:model/Card :result_metadata :card_schema] :id card-id)))
            typed        (metadata typed-id)
            unresolvable (metadata unresolvable-id)]
        (card.metadata/backfill-untyped-model-metadata! (mt/id))
        (testing "an untyped model gets its inferred types and field ids, keeping its overrides"
          (is (=? [{:name "ID"}
                   {:name "NAME" :base_type :type/Text :id (mt/id :venues :name) :display_name "Venue Name"}
                   {:name "CATEGORY_ID"}
                   {:name "LATITUDE"}
                   {:name "LONGITUDE"}
                   {:name "PRICE" :base_type :type/Integer :id (mt/id :venues :price)}]
                  (metadata untyped-id))))
        (testing "a model whose metadata is typed is not changed"
          (is (= typed (metadata typed-id))))
        (testing "a model whose metadata still cannot be inferred is not changed"
          (is (= unresolvable (metadata unresolvable-id))))))))

(deftest deserializing-update-with-model-overrides-keeps-types-test
  (testing "a serdes load that updates a model with only the overrides of its metadata keeps the inferred column types"
    ;; An export writes only the overrides of a model's columns (no base_type, no field id), and the query of the
    ;; model does not change, so the load updates only result_metadata.
    (mt/with-temp [:model/Card {card-id :id} {:type :model :dataset_query (venues-query)}]
      (binding [mi/*deserializing?* true]
        (t2/update! :model/Card card-id {:result_metadata [{:name "ID" :display_name "ID"}
                                                           {:name "NAME" :display_name "Venue Name"}]}))
      (is (=? [{:name "ID" :base_type :type/BigInteger :id (mt/id :venues :id)}
               {:name "NAME" :base_type :type/Text :id (mt/id :venues :name) :display_name "Venue Name"}
               {:name "CATEGORY_ID" :base_type :type/Integer}
               {:name "LATITUDE" :base_type :type/Float}
               {:name "LONGITUDE" :base_type :type/Float}
               {:name "PRICE" :base_type :type/Integer}]
              (t2/select-one-fn :result_metadata :model/Card :id card-id))))))

(deftest deserializing-update-without-metadata-does-not-infer-test
  (testing "a serdes load that updates other columns of a model, and not result_metadata, does not infer its metadata"
    ;; The stored columns have no field ids, as a load of overrides stores them when the inference fails.
    (mt/with-temp [:model/Card {card-id :id} {:type            :model
                                              :dataset_query   (venues-query)
                                              :result_metadata [{:name "ID" :display_name "ID"}
                                                                {:name "NAME" :display_name "Venue Name"}]}]
      (let [calls    (atom 0)
            original (mt/original-fn #'card.metadata/infer-metadata-with-model-overrides)]
        (mt/with-dynamic-fn-redefs [card.metadata/infer-metadata-with-model-overrides
                                    (fn [query card]
                                      (swap! calls inc)
                                      (original query card))]
          (binding [mi/*deserializing?* true]
            (t2/update! :model/Card card-id {:name "Renamed model"}))
          (is (= 0 @calls))
          (testing "control: an update of the query infers the metadata"
            (t2/update! :model/Card card-id {:dataset_query (lib/limit (venues-query) 10)})
            (is (= 1 @calls))))))))
