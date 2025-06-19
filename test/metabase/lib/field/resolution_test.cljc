(ns metabase.lib.field.resolution-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.metadata.result-metadata-test]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.util.humanization :as u.humanization]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel base-type-in-field-ref-does-not-overwrite-everything-test
  (testing "base-type of reference doesn't override a non-default effective-type in the column (#55171)"
    (let [provider (lib.tu/mock-metadata-provider
                    {:database {:id   1
                                :name "My Database"}
                     :tables   [{:id   2
                                 :name "My Table"}]
                     :cards    [{:id              3
                                 :name            "Card 3"
                                 :database-id     (meta/id)
                                 :dataset-query   {:lib/type :mbql/query
                                                   :database 1
                                                   :stages   [{:lib/type     :mbql.stage/mbql
                                                               :source-table 2}]}
                                 :result-metadata [{:id                4
                                                    :base-type         :type/Text
                                                    :effective-type    :type/Date
                                                    :coercion-strategy :Coercion/ISO8601->Date
                                                    :ident             "ybTElkkGoYYBAyDRTIiUe"
                                                    :name              "Field 4"}]}]})
          query    (lib/query provider {:lib/type :mbql/query
                                        :database 1
                                        :stages   [{:lib/type    :mbql.stage/mbql
                                                    :source-card 3}]})]
      (is (=? [{:lib/type                 :metadata/column
                :base-type                :type/Text
                :effective-type           :type/Date
                :coercion-strategy        :Coercion/ISO8601->Date
                :id                       4
                :name                     "Field 4"
                :ident                    "ybTElkkGoYYBAyDRTIiUe"
                :lib/source               :source/card
                :lib/card-id              3
                :lib/source-column-alias  "Field 4"
                :lib/desired-column-alias "Field 4"}]
              (lib/returned-columns query)))
      (is (=? {:lib/type                :metadata/column
               :base-type               :type/Text
               :effective-type          :type/Date
               :coercion-strategy       :Coercion/ISO8601->Date
               :id                      4
               :name                    "Field 4"
               :ident                   "ybTElkkGoYYBAyDRTIiUe"
               :display-name            "Field 4"
               :lib/card-id             3
               :lib/source              :source/card
               :lib/source-column-alias "Field 4"
               :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
              (lib/metadata
               query
               [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} 4]))))))

;;; this is adapted from [[metabase.query-processor.preprocess-test/model-display-names-test]]; the `query` below is
;;; meant to look like the results of [[metabase.query-processor.preprocess/preprocess]] (what we will actually see
;;; in [[metabase.lib.metadata.result-metadata/expected-cols]])
(deftest ^:parallel model-display-names-test
  (testing "Preserve display names from models"
    (let [native-cols (for [col [{:name "EXAMPLE_TIMESTAMP", :base-type :type/DateTime}
                                 {:name "EXAMPLE_WEEK", :base-type :type/DateTime}]]
                        (assoc col :lib/type :metadata/column, :display-name (:name col)))
          mp (as-> meta/metadata-provider mp
               (lib.tu/mock-metadata-provider
                mp
                {:cards
                 [{:id              1
                   :name            "NATIVE"
                   :database-id     (meta/id)
                   :dataset-query   {:database (meta/id), :type :native, :native {:query "SELECT * FROM some_table;"}}
                   :result-metadata native-cols}]})
               ;; Card 2 is a model that uses the Card 1 (a native query) as a source
               (lib.tu/mock-metadata-provider
                mp
                {:cards
                 [(let [query (lib.tu.macros/mbql-query nil
                                {:fields [[:field "EXAMPLE_TIMESTAMP" {:base-type :type/DateTime}]
                                          [:field "EXAMPLE_WEEK" {:base-type :type/DateTime, :temporal-unit :week}]]
                                 :source-table "card__1"})]
                    {:id              2
                     :type            :model
                     :name            "MODEL"
                     :database-id     (meta/id)
                     :dataset-query   query
                     :result-metadata (for [col (lib.metadata.result-metadata/expected-cols (lib/query mp query))]
                                        (assoc col :display-name (u.humanization/name->human-readable-name :simple (:name col))))})]}))
          query {:lib/type     :mbql/query
                 :lib/metadata mp
                 :database     (meta/id)
                 :stages       [{:lib/type :mbql.stage/native
                                 :lib/stage-metadata {:lib/type :metadata/results
                                                      :columns (lib.card/card-metadata-columns mp (lib.metadata/card mp 1))}
                                 :native   "SELECT * FROM some_table;"
                                 ;; `:qp` and `:source-query` keys get added by QP middleware during preprocessing.
                                 :qp/stage-is-from-source-card 1}
                                {:lib/type :mbql.stage/mbql
                                 :lib/stage-metadata {:lib/type :metadata/results
                                                      :columns (lib.card/card-metadata-columns mp (lib.metadata/card mp 2))}
                                 :fields [[:field {:base-type :type/DateTime, :lib/uuid "48052020-59e3-47e7-bfdc-38ab12c27292"}
                                           "EXAMPLE_TIMESTAMP"]
                                          [:field {:base-type :type/DateTime, :temporal-unit :week, :lib/uuid "dd9bdda4-688c-4a14-8ff6-88d4e2de6628"}
                                           "EXAMPLE_WEEK"]]
                                 :qp/stage-had-source-card 1
                                 :qp/stage-is-from-source-card 2
                                 :source-query/model? false}
                                {:lib/type :mbql.stage/mbql
                                 :fields [[:field {:base-type :type/DateTime, :lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                                           "EXAMPLE_TIMESTAMP"]
                                          [:field {:base-type :type/DateTime, :inherited-temporal-unit :week, :lib/uuid "2b33e40b-3537-4126-aef0-96a7792d339b"}
                                           "EXAMPLE_WEEK"]]
                                 :qp/stage-had-source-card 2
                                 ;; i.e., the previous stage was from a model. Added
                                 ;; by [[metabase.query-processor.middleware.fetch-source-query/resolve-source-cards-in-stage]]]
                                 :source-query/model? true}]}]
      (testing `lib.field.resolution/previous-stage-or-source-card-metadata
        (is (= {:display-name "Example Timestamp"}
               (#'lib.field.resolution/previous-stage-or-source-card-metadata query -1 "EXAMPLE_TIMESTAMP"))))
      (let [field-ref (first (lib/fields query -1))]
        (is (=? [:field {:lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"} "EXAMPLE_TIMESTAMP"]
                field-ref))
        (testing `lib.field.resolution/options-metadata*
          (is (=? {:lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (#'lib.field.resolution/options-metadata* field-ref))))
        (testing `lib.field.resolution/resolve-field-metadata
          (is (=? {:name            "EXAMPLE_TIMESTAMP"
                   :display-name    "Example Timestamp"
                   :lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (lib.field.resolution/resolve-field-metadata query -1 field-ref)))
          (testing "preserve display names from field refs"
            (let [ref' (lib.options/update-options field-ref assoc :display-name "My Cool Timestamp")]
              (is (=? {:name            "EXAMPLE_TIMESTAMP"
                       :display-name    "My Cool Timestamp"
                       :lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                      (lib.field.resolution/resolve-field-metadata query -1 ref')))))))
      (testing `lib/returned-columns
        (is (= ["Example Timestamp"
                ;; old `annotate` behavior would append the temporal unit to the display name here
                ;; even tho we explicitly overrode the display name in the model metadata. I don't
                ;; think that behavior is desirable. New behavior takes the display name specified
                ;; by the user as-is.
                "Example Week"
                #_"Example Week: Week"]
               (map :display-name (lib/returned-columns (lib/query mp query)))))))))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (testing "For fields with parents we should return them with a combined name including parent's name"
    (let [metadata-provider metabase.lib.metadata.result-metadata-test/child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 2)]))]
      (is (=? {:table-id          (meta/id :venues)
               ;; these two are a gross symptom. there's some tension. sometimes it makes sense to have an effective
               ;; type: the db type is different and we have a way to convert. Othertimes, it doesn't make sense:
               ;; when the info is inferred. the solution to this might be quite extensive renaming
               :name              "grandparent.parent"
               :parent-id         1
               :visibility-type   :normal
               :display-name      "Grandparent: Parent"
               :base-type         :type/Text}
              (lib.field.resolution/resolve-field-metadata query -1 (first (lib/fields query -1))))))))

(deftest ^:parallel col-info-combine-grandparent-field-names-test
  (testing "nested-nested fields should include grandparent name (etc)"
    (let [metadata-provider metabase.lib.metadata.result-metadata-test/child-parent-grandparent-metadata-provider
          query             (-> (lib/query metadata-provider (meta/table-metadata :venues))
                                (lib/with-fields [(lib.metadata/field metadata-provider 3)]))]
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :parent-id         2
               :id                3
               :visibility-type   :normal
               :display-name      "Grandparent: Parent: Child"
               :base-type         :type/Text}
              (lib.field.resolution/resolve-field-metadata query -1 (first (lib/fields query -1))))))))

(deftest ^:parallel resolve-bad-ref-test
  (let [query (lib/query
               meta/metadata-provider
               {:type  :query
                :query {:source-table (meta/id :venues)
                        ;; invalid field ref, should have used 'PRICE', should still calculate good metadata anyway.
                        :fields [[:field "price" {:base-type     :type/Number
                                                  :temporal-unit :month
                                                  :binning       {:strategy  :num-bins
                                                                  :num-bins  10
                                                                  :bin-width 5
                                                                  :min-value -100
                                                                  :max-value 100}}]]}})]
    (testing "when binning strategy is used ON AN INVALID REF, include `:binning-info`"
      (is (=? {:name                             "price"
               :base-type                        :type/Number
               :display-name                     "Price: 10 bins: Month"
               :lib/source-uuid                  string?
               :lib/type                         :metadata/column
               :metabase.lib.field/binning       {:strategy :num-bins, :num-bins 10, :bin-width 5, :min-value -100, :max-value 100}
               :metabase.lib.field/temporal-unit :month}
              (lib.field.resolution/resolve-field-metadata query -1 (first (lib/fields query -1))))))))

(deftest ^:parallel resolve-field-from-explicit-join-test
  (let [query (lib/query
               meta/metadata-provider
               (lib.tu.macros/$ids venues
                 {:type  :query
                  :query {:source-table (meta/id :venues)
                          :fields       [&Categories.categories.name]
                          :joins        [{:alias        "Categories"
                                          :source-table $$venues
                                          :condition    [:= $category-id &Categories.categories.id]
                                          :strategy     :left-join}]}}))]
    (binding [lib.metadata.calculation/*display-name-style* :long]
      (is (=? (merge
               (m/filter-vals some? (meta/field-metadata :categories :name))
               {:display-name                                      "Categories → Name"
                :lib/original-display-name                         "Name"
                :lib/original-name                                 "NAME"
                :lib/source-uuid                                   string?
                :metabase.lib.join/join-alias                      "Categories"
                :metabase.lib.query/transformation-added-base-type true
                :was-binned                                        false})
              (lib.field.resolution/resolve-field-metadata query -1 (first (lib/fields query -1))))))))

(deftest ^:parallel ref-test
  (testing "Returned metadata should allow use to construct correct refs"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:fields [&Category.categories.name]
                    ;; This is a hand-rolled implicit join clause.
                    :joins  [{:alias        "Category"
                              :source-table $$venues
                              :condition    [:= $category-id &CATEGORIES__via__CATEGORY_ID.categories.id]
                              :strategy     :left-join
                              :fk-field-id  %category-id}]}))
          col   (lib.field.resolution/resolve-field-metadata query -1 (first (lib/fields query -1)))]
      (is (=? {:lib/original-ref [:field {:join-alias "Category"} pos-int?]}
              col))
      (is (=? [:field
               {:lib/uuid       string?
                :effective-type :type/Text
                :base-type      :type/Text
                :join-alias     "Category"}
               (meta/id :categories :name)]
              (lib/ref col))))))
