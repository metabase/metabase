(ns metabase.lib.js.metadata-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.js.metadata :as lib.js.metadata]
   [metabase.lib.metadata :as lib.metadata]))

(deftest ^:parallel parse-fields-test
  (let [metadata-fragment #js {:fields #js {"card__1234:5678" #js {:id 0}
                                            "5678" #js {:id 1}
                                            "8765" #js {:id 2}
                                            "card__1234:4321" #js {:id 3}}}
        parsed-fragment (lib.js.metadata/parse-objects :field metadata-fragment)]
    (is (every? delay? (vals parsed-fragment)))
    (is (= {4321 {:lib/type :metadata/column, :id 3}
            5678 {:lib/type :metadata/column, :id 1}
            8765 {:lib/type :metadata/column, :id 2}}
           (update-vals parsed-fragment deref)))))

(def ^:private mock-field-metadata-with-external-remap
  #js {"id"               36
       "name"             "CATEGORY_ID"
       "has_field_values" "none"
       "dimensions"       #js [{"id"                      72
                                "field_id"                36
                                "name"                    "Category ID [external remap]"
                                "type"                    "external"
                                "human_readable_field_id" 67}]})

(deftest ^:parallel parse-field-with-external-remap-test
  (let [metadata          #js {:fields #js {"36" mock-field-metadata-with-external-remap}}
        metadata-provider (lib.js.metadata/metadata-provider 1 metadata)]
    (is (= {:lib/type           :metadata/column
            :id                 36
            :name               "CATEGORY_ID"
            :has-field-values   :none
            :lib/external-remap {:lib/type :metadata.column.remapping/external
                                 :id       72
                                 :name     "Category ID [external remap]"
                                 :field-id 67}}
           (lib.metadata/field metadata-provider 36)))))

(def ^:private mock-field-metadata-with-internal-remap
  #js {"id"               33
       "name"             "ID"
       "has_field_values" "none"
       "dimensions"       #js [{"id"                      66
                                "field_id"                33
                                "name"                    "ID [internal remap]"
                                "type"                    "internal"
                                "human_readable_field_id" nil}]})

(deftest ^:parallel parse-field-with-internal-remap-test
  (let [metadata          #js {:fields #js {"33" mock-field-metadata-with-internal-remap}}
        metadata-provider (lib.js.metadata/metadata-provider 1 metadata)]
    (is (= {:lib/type           :metadata/column
            :id                 33
            :name               "ID"
            :has-field-values   :none
            :lib/internal-remap {:lib/type :metadata.column.remapping/internal
                                 :id       66
                                 :name     "ID [internal remap]"}}
           (lib.metadata/field metadata-provider 33)))))

(deftest ^:parallel do-not-remove-during-normalization-test
  (let [metadata #js {:fields #js {"36" mock-field-metadata-with-external-remap}}
        mp       (lib.js.metadata/metadata-provider 1 metadata)
        query    {:lib/type :mbql/query, :database 1, :lib/metadata mp, :stages [{:lib/type :mbql.stage/mbql, :source-table 2}]}]
    (is (= query
           (lib/normalize query)))))

(def ^:private mock-card-based-segment-metadata
  #js {"id"          200
       "name"        "Expensive Products"
       "card_id"     1
       "description" "Products with price > 50"
       "card"        #js {"id"   1
                          "name" "Products Model"}
       "definition"  #js {}})

(def ^:private mock-table-based-segment-metadata
  #js {"id"          100
       "name"        "Cheap Products"
       "table_id"    10
       "description" "Products with price < 10"
       "definition"  #js {}})

(deftest ^:parallel available-segments-with-js-metadata-provider-test
  (testing "available-segments filters by card-id with JS metadata provider"
    (let [;; metadata with both a table-based and card-based segment
          metadata #js {:segments #js {"100" mock-table-based-segment-metadata
                                       "200" mock-card-based-segment-metadata}}
          metadata-provider (lib.js.metadata/metadata-provider 1 metadata)
          query {:lib/type     :mbql/query
                 :database     1
                 :lib/metadata metadata-provider
                 :stages       [{:lib/type    :mbql.stage/mbql
                                 :source-card 1}]}
          available (lib/available-segments query)]
      (testing "should return only the card-based segment matching source-card"
        (is (= 1 (count available)))
        (is (= 200 (:id (first available))))
        (is (= "Expensive Products" (:name (first available))))
        (is (= 1 (:card-id (first available)))))))
  (testing "available-segments filters by table-id with JS metadata provider"
    (let [metadata #js {:segments #js {"100" mock-table-based-segment-metadata
                                       "200" mock-card-based-segment-metadata}}
          metadata-provider (lib.js.metadata/metadata-provider 1 metadata)
          query {:lib/type     :mbql/query
                 :database     1
                 :lib/metadata metadata-provider
                 :stages       [{:lib/type     :mbql.stage/mbql
                                 :source-table 10}]}
          available (lib/available-segments query)]
      (testing "should return only the table-based segment matching source-table"
        (is (= 1 (count available)))
        (is (= 100 (:id (first available))))
        (is (= "Cheap Products" (:name (first available))))
        (is (= 10 (:table-id (first available))))))))
