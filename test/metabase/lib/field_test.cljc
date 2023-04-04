(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/stage-column (lib/saved-question-query
                                                   meta/metadata-provider
                                                   meta/saved-question)
                                                  "ID")]
    (is (=? {:lib/type :metadata/field
             :name     "ID"}
            field-metadata))
    (is (=? [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]
            (lib/ref field-metadata)))))

(defn- grandparent-parent-child-id [field]
  (+ (meta/id :venues :id)
     (case field
       :grandparent 50
       :parent      60
       :child       70)))

(def ^:private grandparent-parent-child-metadata-provider
  "A MetadataProvider for a Table that nested Fields: grandparent, parent, and child"
  (let [grandparent {:lib/type  :metadata/field
                     :name      "grandparent"
                     :id        (grandparent-parent-child-id :grandparent)
                     :base_type :type/Text}
        parent      {:lib/type  :metadata/field
                     :name      "parent"
                     :parent_id (grandparent-parent-child-id :grandparent)
                     :id        (grandparent-parent-child-id :parent)
                     :base_type :type/Text}
        child       {:lib/type  :metadata/field
                     :name      "child"
                     :parent_id (grandparent-parent-child-id :parent)
                     :id        (grandparent-parent-child-id :child)
                     :base_type :type/Text}]
    (lib.tu/mock-metadata-provider
     {:database meta/metadata
      :tables   [(meta/table-metadata :venues)]
      :fields   (mapv (fn [field-metadata]
                        (merge {:visibility_type :normal
                                :table_id        (meta/id :venues)}
                               field-metadata))
                      [grandparent parent child])})))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (letfn [(col-info [a-field-clause]
            (lib.metadata.calculation/metadata
             {:lib/type     :mbql/query
              :lib/metadata grandparent-parent-child-metadata-provider
              :type         :pipeline
              :database     (meta/id)
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid (str (random-uuid))}
                              :source-table (meta/id :venues)}]}
             -1
             a-field-clause))]
    (testing "For fields with parents we should return them with a combined name including parent's name"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent"
               :parent_id         (grandparent-parent-child-id :grandparent)
               :id                (grandparent-parent-child-id :parent)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table_id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :parent_id         (grandparent-parent-child-id :parent)
               :id                (grandparent-parent-child-id :child)
               :visibility_type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (grandparent-parent-child-id :child)]))))))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    (is (=? {:name          "sum"
             :display_name  "sum of User ID"
             :base_type     :type/Integer
             :semantic_type :type/FK}
            (lib.metadata.calculation/metadata
             (lib.tu/venues-query-with-last-stage
              {:lib/type           :mbql.stage/native
               :lib/stage-metadata {:lib/type :metadata/results
                                    :columns  [{:lib/type      :metadata/field
                                                :name          "abc"
                                                :display_name  "another Field"
                                                :base_type     :type/Integer
                                                :semantic_type :type/FK}
                                               {:lib/type      :metadata/field
                                                :name          "sum"
                                                :display_name  "sum of User ID"
                                                :base_type     :type/Integer
                                                :semantic_type :type/FK}]}
               :native             "SELECT whatever"})
             -1
             [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"])))))

(deftest ^:parallel joined-field-display-name-test
  (let [query {:lib/type     :mbql/query
               :type         :pipeline
               :stages       [{:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid "fdcfaa06-8e65-471d-be5a-f1e821022482"}
                               :source-table (meta/id :venues)
                               :fields       [[:field
                                               {:join-alias "CATEGORIES__via__CATEGORY_ID"
                                                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
                                               (meta/id :categories :name)]]
                               :joins        [{:lib/type    :mbql/join
                                               :lib/options {:lib/uuid "490a5abb-54c2-4e62-9196-7e9e99e8d291"}
                                               :alias       "CATEGORIES__via__CATEGORY_ID"
                                               :condition   [:=
                                                             {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                             (lib.tu/field-clause :venues :category-id)
                                                             (lib.tu/field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]
                                               :strategy    :left-join
                                               :fk-field-id (meta/id :venues :category-id)
                                               :stages      [{:lib/type     :mbql.stage/mbql
                                                              :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                              :source-table (meta/id :categories)}]}]}]
               :database     (meta/id)
               :lib/metadata meta/metadata-provider}
        field [:field
               {:join-alias "CATEGORIES__via__CATEGORY_ID"
                :lib/uuid   "8704e09b-496e-4045-8148-1eef28e96b51"}
               (meta/id :categories :name)]]
    (is (= "Categories → Name"
           (lib.metadata.calculation/display-name query -1 field)))
    (is (=? {:display_name "Categories → Name"}
            (lib.metadata.calculation/metadata query -1 field)))))

(deftest ^:parallel field-with-temporal-unit-test
  (let [query (lib/query-for-table-name meta/metadata-provider "CHECKINS")
        f (lib/temporal-bucket (lib/field (meta/id :checkins :date)) :year)]
    (is (fn? f))
    (let [field (f query -1)]
      (is (=? [:field {:temporal-unit :year} (meta/id :checkins :date)]
              field))
      (is (=? :year
              (lib.temporal-bucket/current-temporal-bucket (lib.metadata.calculation/metadata query -1 field))))
      (is (= "Date (year)"
             (lib.metadata.calculation/display-name query -1 field))))))
