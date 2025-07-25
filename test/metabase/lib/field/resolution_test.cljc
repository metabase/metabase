(ns metabase.lib.field.resolution-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.breakout-test]
   [metabase.lib.card :as lib.card]
   [metabase.lib.card-test]
   [metabase.lib.core :as lib]
   [metabase.lib.field-test]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.metadata.result-metadata-test]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.mocks-31368 :as lib.tu.mocks-31368]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    ;; `resolve-field-metadata` SHOULD basically be the implementation of `lib/metadata` for a field ref
    (doseq [f [#'lib/metadata
               #'lib.field.resolution/resolve-field-ref]]
      (testing f
        (is (=? {:name          "sum"
                 :display-name  "sum of User ID"
                 :base-type     :type/Integer
                 :semantic-type :type/FK}
                (lib/metadata
                 (lib.tu/native-query)
                 -1
                 [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} "sum"])))))))

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
               :display-name            "Field 4"
               :lib/card-id             3
               :lib/source              :source/card
               :lib/source-column-alias "Field 4"
               :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
              (lib/metadata
               query
               [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} 4]))))))

(deftest ^:parallel col-info-combine-parent-field-names-test
  (letfn [(col-info [a-field-clause]
            (lib/metadata
             {:lib/type     :mbql/query
              :lib/metadata metabase.lib.field-test/grandparent-parent-child-metadata-provider
              :database     (meta/id)
              :stages       [{:lib/type     :mbql.stage/mbql
                              :lib/options  {:lib/uuid (str (random-uuid))}
                              :source-table (meta/id :venues)}]}
             -1
             a-field-clause))]
    (testing "For fields with parents we should return them with a combined name including parent's name"
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent"
               :parent-id         (metabase.lib.field-test/grandparent-parent-child-id :grandparent)
               :id                (metabase.lib.field-test/grandparent-parent-child-id :parent)
               :visibility-type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (metabase.lib.field-test/grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table-id          (meta/id :venues)
               :name              "grandparent.parent.child"
               :parent-id         (metabase.lib.field-test/grandparent-parent-child-id :parent)
               :id                (metabase.lib.field-test/grandparent-parent-child-id :child)
               :visibility-type   :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (metabase.lib.field-test/grandparent-parent-child-id :child)]))))))

(deftest ^:parallel fallback-metadata-from-saved-question-when-missing-from-metadata-provider-test
  (testing "Handle missing column metadata from the metadata provider; should still work if in Card result metadata (#31624)"
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
                                 :result-metadata [{:lib/type  :metadata/column
                                                    :id        4
                                                    :name      "Field 4"
                                                    :base-type :type/Integer}]}]})
          query    (lib/query provider {:lib/type :mbql/query
                                        :database 1
                                        :stages   [{:lib/type    :mbql.stage/mbql
                                                    :source-card 3}]})]
      (is (=? [{:lib/type                 :metadata/column
                :base-type                :type/Integer
                :effective-type           :type/Integer
                :id                       4
                :name                     "Field 4"
                :lib/source               :source/card
                :lib/card-id              3
                :lib/source-column-alias  "Field 4"
                :lib/desired-column-alias "Field 4"}]
              (lib/returned-columns query)))
      (is (=? {:lib/type                :metadata/column
               :base-type               :type/Text
               :effective-type          :type/Integer
               :id                      4
               :name                    "Field 4"
               :display-name            "Field 4"
               :lib/card-id             3
               :lib/source              :source/card
               :lib/source-column-alias "Field 4"
               :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
              (lib/metadata
               query
               [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} 4]))))))

(deftest ^:parallel resolve-column-name-in-join-test
  (testing ":field refs with string names should work if the Field comes from a :join"
    (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                             meta/metadata-provider
                             [(lib.tu.macros/mbql-query checkins
                                {:aggregation [[:count]]
                                 :breakout    [$user-id]})])
          cols  (->> (lib.metadata/card metadata-provider 1)
                     (lib/query metadata-provider)
                     lib/returned-columns
                     (m/index-by :name))
          query (-> (lib/query metadata-provider (meta/table-metadata :checkins))
                    (lib/join (lib/with-join-alias
                               (lib/join-clause (lib.metadata/card metadata-provider 1)
                                                [(lib/= (meta/field-metadata :users :id)
                                                        (lib/ref (get cols "USER_ID")))])
                               "checkins_by_user"))
                    (lib/breakout (lib/with-temporal-bucket (meta/field-metadata :users :last-login) :month))
                    (lib/aggregate (lib/avg (lib/with-join-alias (lib/ref (get cols "count")) "checkins_by_user"))))]
      (is (=? [{:id                       (meta/id :users :last-login)
                :name                     "LAST_LOGIN"
                :lib/source               :source/table-defaults
                :lib/breakout?            true
                :lib/source-column-alias "LAST_LOGIN"
                :lib/desired-column-alias "LAST_LOGIN"}
               {:name                     "avg"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "avg"
                :lib/desired-column-alias "avg"}]
              (lib/returned-columns query))))))

(deftest ^:parallel source-card-table-display-info-test
  ;; this uses a legacy `card__<id>` `:table-id` intentionally; we don't currently have logic that parses this to
  ;; something like `:card-id` for Column Metadata yet. Make sure it works correctly.
  (let [query (assoc (lib.tu/venues-query) :lib/metadata lib.tu/metadata-provider-with-card)
        field (lib/metadata query (assoc (lib.metadata/field query (meta/id :venues :name))
                                         :table-id "card__1"))]
    (is (=? {:name           "NAME"
             :display-name   "Name"
             :semantic-type  :type/Name
             :effective-type :type/Text
             :table          {:name "My Card", :display-name "My Card"}}
            (lib/display-info query field)))))

;;; this is adapted from [[metabase.query-processor.preprocess-test/model-display-names-test]]; the `query` below is
;;; meant to look like the results of [[metabase.query-processor.preprocess/preprocess]] (what we will actually see
;;; in [[metabase.lib.metadata.result-metadata/returned-columns]])
;;;
;;; TODO (Cam 6/23/25) -- rework this to use the [[mock-preprocess]] stuff I added below
(deftest ^:parallel model-display-names-test
  (testing "Preserve display names from models"
    (let [native-cols (for [col [{:name "EXAMPLE_TIMESTAMP", :base-type :type/DateTime}
                                 {:name "EXAMPLE_WEEK", :base-type :type/DateTime}]]
                        (assoc col :lib/type :metadata/column, :display-name (:name col)))
          mp          (as-> meta/metadata-provider mp
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
                                         {:fields       [[:field "EXAMPLE_TIMESTAMP" {:base-type :type/DateTime}]
                                                         [:field "EXAMPLE_WEEK" {:base-type :type/DateTime, :temporal-unit :week}]]
                                          :source-table "card__1"})]
                             {:id              2
                              :type            :model
                              :name            "MODEL"
                              :database-id     (meta/id)
                              :dataset-query   query
                              :result-metadata (for [col (lib.metadata.result-metadata/returned-columns (lib/query mp query))]
                                                 (assoc col :display-name (u.humanization/name->human-readable-name :simple (:name col))))})]}))
          query       {:lib/type     :mbql/query
                       :lib/metadata mp
                       :database     (meta/id)
                       :stages       [{:lib/type                     :mbql.stage/native
                                       :lib/stage-metadata           {:lib/type :metadata/results
                                                                      :columns  (lib.card/card-metadata-columns mp (lib.metadata/card mp 1))}
                                       :native                       "SELECT * FROM some_table;"
                                       ;; `:qp` and `:source-query` keys get added by QP middleware during preprocessing.
                                       :qp/stage-is-from-source-card 1}
                                      {:lib/type                     :mbql.stage/mbql
                                       :lib/stage-metadata           {:lib/type :metadata/results
                                                                      :columns  (lib.card/card-metadata-columns mp (lib.metadata/card mp 2))}
                                       :fields                       [[:field {:base-type :type/DateTime, :lib/uuid "48052020-59e3-47e7-bfdc-38ab12c27292"}
                                                                       "EXAMPLE_TIMESTAMP"]
                                                                      [:field {:base-type :type/DateTime, :temporal-unit :week, :lib/uuid "dd9bdda4-688c-4a14-8ff6-88d4e2de6628"}
                                                                       "EXAMPLE_WEEK"]]
                                       :qp/stage-had-source-card     1
                                       :qp/stage-is-from-source-card 2
                                       :source-query/model?          false}
                                      {:lib/type                 :mbql.stage/mbql
                                       :fields                   [[:field {:base-type :type/DateTime, :lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                                                                   "EXAMPLE_TIMESTAMP"]
                                                                  [:field {:base-type :type/DateTime, :inherited-temporal-unit :week, :lib/uuid "2b33e40b-3537-4126-aef0-96a7792d339b"}
                                                                   "EXAMPLE_WEEK"]]
                                       :qp/stage-had-source-card 2
                                       ;; i.e., the previous stage was from a model. Added
                                       ;; by [[metabase.query-processor.middleware.fetch-source-query/resolve-source-cards-in-stage]]]
                                       :source-query/model?      true}]}]
      (testing `lib.field.resolution/previous-stage-or-source-card-metadata
        (is (=? {:display-name "Example Timestamp"
                 :lib/source   :source/card}
                (#'lib.field.resolution/previous-stage-or-source-card-metadata query -1 [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/*}
                                                                                         "EXAMPLE_TIMESTAMP"]))))
      (let [field-ref (first (lib/fields query -1))]
        (is (=? [:field {:lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"} "EXAMPLE_TIMESTAMP"]
                field-ref))
        (testing `lib.field.resolution/options-metadata*
          (is (=? {:lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (#'lib.field.resolution/options-metadata field-ref))))
        (testing `lib.field.resolution/resolve-field-ref
          (is (=? {:name            "EXAMPLE_TIMESTAMP"
                   :display-name    "Example Timestamp"
                   :lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (lib.field.resolution/resolve-field-ref query -1 field-ref)))
          (testing "preserve display names from field refs"
            (let [ref' (lib.options/update-options field-ref assoc :display-name "My Cool Timestamp")]
              (is (=? {:name                   "EXAMPLE_TIMESTAMP"
                       :display-name           "My Cool Timestamp"
                       :lib/ref-display-name   "My Cool Timestamp"
                       :lib/model-display-name "Example Timestamp"
                       :lib/source-uuid        "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                      (lib.field.resolution/resolve-field-ref query -1 ref')))))))
      (testing `lib/returned-columns
        (is (= ["Example Timestamp"
                "Example Week: Week"]
               (map :display-name (lib/returned-columns (lib/query mp query)))))))))

(deftest ^:parallel col-info-combine-parent-field-names-test-2
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
              (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1))))))))

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
              (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1))))))))

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
              (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1))))))))

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
                :metabase.lib.query/transformation-added-base-type true})
              (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1))))))))

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
          col   (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1)))]
      (is (=? {:lib/original-ref [:field {:join-alias "Category"} pos-int?]}
              col))
      (is (=? [:field
               {:lib/uuid       string?
                :effective-type :type/Text
                :base-type      :type/Text
                :join-alias     "Category"}
               (meta/id :categories :name)]
              (lib/ref col))))))

(deftest ^:parallel legacy-query-joined-field-display-name-test
  (testing "Should calculate correct metadata for joined fields when source query is a legacy MBQL query (#31368)"
    (doseq [has-result-metadata? [false true]]
      (testing (str "\nHas result metadata? " (pr-str has-result-metadata?))
        (let [query             (lib.tu.mocks-31368/query-with-legacy-source-card has-result-metadata?)
              breakoutable-cols (lib/breakoutable-columns query)
              breakout-col      (m/find-first (fn [col]
                                                (= (:id col) (meta/id :products :category)))
                                              breakoutable-cols)]
          (is (some? breakout-col))
          (let [query'       (lib/breakout query breakout-col)
                breakout-ref (first (lib/breakouts query' -1))]
            (is (=? [:field {:lib/uuid string?, :join-alias (symbol "nil #_\"key is not present.\"")} "Products__CATEGORY"]
                    breakout-ref))
            (binding [lib.metadata.calculation/*display-name-style* :long]
              (is (=? {:active                    true
                       :base-type                 :type/Text
                       :display-name              "Products → Category"
                       :effective-type :type/Text
                       :fingerprint               map?
                       :id                        (meta/id :products :category)
                       :lib/original-display-name "Category"
                       :lib/original-name         "CATEGORY"
                       :lib/original-join-alias   "Products"
                       ;; this key is DEPRECATED (see description in column metadata schema) but still used (FOR
                       ;; NOW) (QUE-1403)
                       :source-alias              "Products"
                       :lib/source                :source/card ; or is it supposed to be `:source/table-defaults`
                       :lib/source-uuid           (lib.options/uuid breakout-ref)
                       :lib/type                  :metadata/column
                       :name                      "CATEGORY"
                       :semantic-type             :type/Category
                       :table-id                  (meta/id :products)
                       :visibility-type           :normal}
                      ;; this eventually uses `lib.field.resolution`
                      (lib.field.resolution/resolve-field-ref query' -1 breakout-ref))))))))))

(deftest ^:parallel join-from-model-test
  (testing "Do the right thing with joins that come from models"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id 1
                        :name "Model"
                        :type :model
                        :database-id (meta/id)
                        :dataset-query (lib.tu.macros/mbql-query venues
                                         {:joins [{:source-table $$categories
                                                   :alias "C"
                                                   :condition    [:= &C.categories.id $venues.category-id]}]
                                          :fields [[:field
                                                    "C__NAME"
                                                    {:base-type :type/Text
                                                     :temporal-unit :month
                                                     :binning       {:strategy :default}}]]})}]})
          query (lib/query mp {:type :query, :database (meta/id), :query {:source-table "card__1"}})
          expected {:base-type                        :type/Text
                    :display-name                     "C → Name: Auto binned: Month"
                    :effective-type                   :type/Text
                    :fingerprint                      map?
                    :id                               (meta/id :categories :name)
                    :inherited-temporal-unit          :month
                    :semantic-type                    :type/Name
                    :table-id                         (meta/id :categories)
                    :visibility-type                  :normal
                    :lib/original-binning             {:strategy :default}
                    :lib/card-id                      1
                    :lib/desired-column-alias         "C__NAME"
                    :lib/original-display-name        "Name"
                    :lib/original-join-alias          "C"
                    :lib/original-name                "NAME"
                    :lib/source                       :source/card
                    :lib/source-uuid                  string?
                    :lib/type                         :metadata/column
                    :metabase.lib.field/binning       (symbol "nil #_\"key is not present.\"")
                    :metabase.lib.field/temporal-unit (symbol "nil #_\"key is not present.\"")
                    :metabase.lib.join/join-alias     (symbol "nil #_\"key is not present.\"")}
          field-ref [:field {:lib/uuid (str (random-uuid)), :base-type :type/Text} "C__NAME"]]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (testing "with model as :source-card (current-stage-source-card-metadata pathway)"
          (is (=? (assoc expected
                         :lib/deduplicated-name   "NAME"
                         :name                    "NAME"
                         :lib/source-column-alias "C__NAME")
                  (lib.field.resolution/resolve-field-ref query -1 field-ref))))
        (testing "With a query that has been preprocessed (current-stage-model-metadata pathway)"
          (let [model-query (lib/query mp (:dataset-query (lib.metadata/card mp 1)))
                query'      (update query :stages (fn [[original-stage]]
                                                    [(-> (first (:stages model-query))
                                                         (assoc :qp/stage-is-from-source-card 1))
                                                     (dissoc original-stage :source-card)]))]
            (is (=? (assoc expected :lib/source-column-alias "C__NAME")
                    (lib.field.resolution/resolve-field-ref query' -1 field-ref)))))))))

(deftest ^:parallel legacy-query-with-broken-breakout-breakouts-test
  (testing "Handle busted references to joined Fields in broken breakouts from broken drill-thrus (#31482)"
    (let [query        (metabase.lib.breakout-test/legacy-query-with-broken-breakout)
          breakout-ref (first (lib/breakouts query))]
      (is (=? [:field {:lib/uuid string?} (meta/id :products :category)]
              breakout-ref))
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (is (=? {:active                       true
                 :base-type                    :type/Text
                 :database-type                "CHARACTER VARYING"
                 :display-name                 "Products → Category"
                 :fingerprint-version          5
                 :has-field-values             :auto-list
                 :id                           (meta/id :products :category)
                 :lib/original-display-name    "Category"
                 :lib/original-join-alias      "Products"
                 :lib/original-name            "CATEGORY"
                 :lib/source                   :source/card
                 :lib/breakout?                true
                 :lib/source-uuid              (lib.options/uuid breakout-ref)
                 :lib/type                     :metadata/column
                 :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
                 :name                         "CATEGORY"
                 :preview-display              true
                 :semantic-type                :type/Category
                 :table-id                     (meta/id :products)
                 :visibility-type              :normal}
                (first (lib/breakouts-metadata query)))
            "don't set :lib/previous-stage-join-alias")))))

(deftest ^:parallel column-filter-join-alias-test
  (testing "We should be able to resolve a ref missing join alias and add that to the metadata (#36861)"
    (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                           (lib/join (lib/join-clause (meta/table-metadata :products)
                                                      [(lib/= (meta/field-metadata :orders :product-id)
                                                              (meta/field-metadata :products :id))])))
          broken-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Text} "CATEGORY"]]
      (is (=? {:id                           (meta/id :products :category)
               :table-id                     (meta/id :products)
               :name                         "CATEGORY"
               :lib/original-join-alias      "Products"
               :metabase.lib.join/join-alias "Products"}
              (lib.field.resolution/resolve-field-ref query -1 broken-ref))))))

(deftest ^:parallel explict-join-against-implicit-join-test
  (testing "Should be able to explicitly join against an implicit join (#20519)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :breakout     [$product-id->products.category]
                                   :aggregation  [[:count]]}
                    :joins        [{:source-table $$products
                                    :alias        "Products"
                                    :condition    [:= *products.category &Products.products.category]
                                    :fields       [&Products.products.id
                                                   &Products.products.title]}]
                    :expressions  {"CC" [:+ 1 1]}
                    :order-by     [[:asc &Products.products.id]]}))]
      (is (= ["PRODUCTS__via__PRODUCT_ID__CATEGORY"
              "count"
              "CC"
              "ID"
              "TITLE"]
             (map :lib/source-column-alias (lib/returned-columns query)))))))

(deftest ^:parallel card-name-in-display-name-test
  (testing "Calculate fresh display names using join names rather than reusing names in source metadata"
    (binding [lib.metadata.calculation/*display-name-style* :long]
      (let [q1    (lib.tu.macros/$ids nil
                    {:source-table $$orders
                     :joins        [{:source-table $$people
                                     :alias        "People"
                                     :condition    [:= $orders.user-id &People.people.id]
                                     :fields       [&People.people.address]
                                     :strategy     :left-join}]
                     :fields       [$orders.id &People.people.address]})
            query (lib/query
                   meta/metadata-provider
                   (lib.tu.macros/mbql-query products
                     {:joins  [{:source-query    q1
                                :source-metadata (for [col (lib/returned-columns
                                                            (lib/query meta/metadata-provider {:database (meta/id), :type :query, :query q1}))]
                                                   (-> col
                                                       (dissoc :lib/type)
                                                       (update-keys (fn [k]
                                                                      (cond-> k
                                                                        (simple-keyword? k) u/->snake_case_en)))))
                                :alias           "Question 54"
                                :condition       [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                                :fields          [[:field %orders.id {:join-alias "Question 54"}]
                                                  [:field %people.address {:join-alias "Question 54"}]]
                                :strategy        :left-join}]
                      :fields [!default.created-at
                               [:field %orders.id {:join-alias "Question 54"}]
                               [:field %people.address {:join-alias "Question 54"}]]}))]
        (is (=? {:lib/original-display-name "Address"}
                (lib.field.resolution/resolve-field-ref query -1 (last (lib/fields query -1)))))))))

(deftest ^:parallel disambiguate-duplicate-columns-test
  (testing "Handle duplicates of the same column with different bucketing/binning correctly"
    (let [q1 (lib/query
              meta/metadata-provider
              {:stages [{:lib/type     :mbql.stage/mbql
                         :source-table (meta/id :orders)
                         :aggregation  [[:count {:name "count"}]]
                         :breakout     [[:field {:temporal-unit :quarter} (meta/id :orders :created-at)]
                                        [:field {:temporal-unit :day-of-week} (meta/id :orders :created-at)]]}]})
          q2 (lib/query
              meta/metadata-provider
              {:lib/type :mbql/query
               :database (meta/id)
               :stages   [(assoc (lib.util/query-stage q1 0)
                                 :lib/stage-metadata {:lib/type :metadata/results
                                                      :columns  (lib/returned-columns q1)})
                          {:lib/type :mbql.stage/mbql
                           :fields   [[:field {:base-type :type/DateTimeWithLocalTZ} "CREATED_AT"]
                                      [:field {:base-type :type/DateTimeWithLocalTZ} "CREATED_AT_2"]]}]})]
      (is (= ["Created At: Quarter"
              "Created At: Day of week"]
             (map :display-name (lib/returned-columns q2)))))))

;;; TODO (Cam 6/22/25) -- move this to `lib.test-util` or something if it proves to be useful generally
(defn- mock-preprocess-resolve-cards [query]
  (let [query' (lib.walk/walk-stages
                query
                (fn [query _path {:keys [source-card], :as stage}]
                  (if-not (:source-card stage)
                    stage
                    (let [card        (lib.metadata/card query source-card)
                          card-query  (lib/query (lib.metadata/->metadata-provider query) (:dataset-query card))
                          card-stages (:stages card-query)]
                      (conj (vec (butlast card-stages))
                            (-> (last card-stages)
                                (assoc :qp/stage-is-from-source-card source-card
                                       :source-query/model? (= (:type source-card) :model))
                                (cond-> (:result-metadata card) (assoc :lib/stage-metadata {:lib/type :metadata/results
                                                                                            :columns  (:result-metadata card)})))
                            (-> stage
                                (dissoc :source-card)
                                (assoc :qp/stage-had-source-card source-card)))))))]
    (if (= query' query)
      query
      (recur query'))))

(defn- mock-preprocess-add-metadata [query]
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (if (seq (:lib/stage-metadata stage))
       stage
       (let [cols             (lib.walk/apply-f-for-stage-at-path
                               (fn [query stage-number]
                                 (lib.metadata.result-metadata/returned-columns (update query :stages #(take (inc stage-number) %))))
                               query path)
             returned-columns {:lib/type :metadata/results
                               :columns  cols}]
         (assoc stage :lib/stage-metadata returned-columns))))))

(defn- mock-preprocess [query]
  (-> query
      mock-preprocess-resolve-cards
      mock-preprocess-add-metadata))

(deftest ^:parallel propagate-join-aliases-test
  (testing "Join aliases from prior stages should get propagated in display names"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:fields [$id $subtotal $tax $total $created-at $quantity]
                                             :joins  [{:source-table $$products
                                                       :alias        "Product"
                                                       :condition    [:= $orders.product-id
                                                                      [:field %products.id {:join-alias "Product"}]]
                                                       :fields       [[:field %products.id {:join-alias "Product"}]
                                                                      [:field %products.title {:join-alias "Product"}]
                                                                      [:field %products.vendor {:join-alias "Product"}]
                                                                      [:field %products.price {:join-alias "Product"}]
                                                                      [:field %products.rating {:join-alias "Product"}]]}]})}
                          {:id            2
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:source-table "card__1"
                                             :fields       [[:field "ID" {:base-type :type/BigInteger}]
                                                            [:field "TAX" {:base-type :type/Float}]
                                                            [:field "TOTAL" {:base-type :type/Float}]
                                                            [:field "ID_2" {:base-type :type/BigInteger}]
                                                            [:field "RATING" {:base-type :type/Float}]]
                                             :filter       [:> [:field "TOTAL" {:base-type :type/Float}] 3]})}]})
          query (mock-preprocess
                 (lib/query
                  mp
                  (lib.tu.macros/mbql-query orders
                    {:source-table "card__2"
                     :aggregation  [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                     :breakout     [[:field "RATING" {:base-type :type/Float}]]})))]
      (is (=? {:stages [{:qp/stage-is-from-source-card 1
                         :lib/stage-metadata           map?
                         :joins                        [{:stages [{:lib/stage-metadata map?}]}]}
                        {:qp/stage-is-from-source-card 2
                         :lib/stage-metadata           map?}
                        {}]}
              query))
      (testing :lib/stage-metadata
        (let [stage-cols (fn [stage-number]
                           (u/prog1 (get-in (lib.util/query-stage query stage-number) [:lib/stage-metadata :columns])
                             (assert (seq <>))))]
          (testing "first stage (from Card 1)"
            (is (=? {:name                         "RATING"
                     :display-name                 "Product → Rating"
                     :metabase.lib.join/join-alias "Product"}
                    (m/find-first #(= (:name %) "RATING")
                                  (stage-cols 0)))))
          (testing "second stage (from Card 2)"
            (is (=? {:name                      "RATING"
                     :display-name              "Product → Rating"
                     :lib/original-display-name "Rating"
                     :lib/original-join-alias   "Product"}
                    (m/find-first #(= (:name %) "RATING")
                                  (stage-cols 1)))))))
      (testing "returned columns (final stage)"
        (binding [lib.metadata.calculation/*display-name-style* :long]
          (is (=? [{:display-name              "Product → Rating"
                    :lib/original-display-name "Rating"
                    :lib/original-join-alias   "Product"}
                   {:display-name "Sum of Total"}]
                  (lib/returned-columns query))))))))

;;; adapted from [[metabase.queries.api.card-test/model-card-test-2]]
(deftest ^:parallel preserve-model-metadata-test
  (let [mp        (metabase.lib.card-test/preserve-edited-metadata-test-mock-metadata-provider
                   {:result-metadata-style :metabase.lib.card-test/legacy-snake-case-qp})
        edited-mp (lib.tu/merged-mock-metadata-provider
                   mp
                   {:cards [{:id              3
                             :result-metadata (for [col (:result-metadata (lib.metadata/card mp 3))]
                                                (assoc col :description "user description", :display_name "user display name"))}]})]
    (testing "card metadata (sanity check)"
      (is (=? {:name "NAME", :description "user description", :display_name "user display name"}
              (m/find-first #(= (:name %) "NAME")
                            (:result-metadata (lib.metadata/card edited-mp 3))))))
    (testing "field resolution"
      (let [query     (lib/query
                       edited-mp
                       {:database (meta/id)
                        :type     :query
                        :query    {:qp/stage-had-source-card 3
                                   :source-query/model?      true
                                   :source-query             {:qp/stage-is-from-source-card 3
                                                              :native                       "select * from venues"}
                                   :source-metadata          (:result-metadata (lib.metadata/card edited-mp 3))
                                   :fields                   [[:field (meta/id :venues :id) nil]
                                                              [:field (meta/id :venues :name) nil]
                                                              [:field (meta/id :venues :category-id) nil]
                                                              [:field (meta/id :venues :latitude) nil]
                                                              [:field (meta/id :venues :longitude) nil]
                                                              [:field (meta/id :venues :price) nil]]}})
            field-ref [:field {:lib/uuid (str (random-uuid))} (meta/id :venues :name)]]
        (is (pos-int? (#'lib.field.resolution/current-stage-model-card-id query 0)))
        (testing `lib.field.resolution/stage-attached-metadata
          (is (=? {:name "NAME", :description "user description", :display-name "user display name"}
                  (m/find-first #(= (:name %) "NAME")
                                (#'lib.field.resolution/stage-attached-metadata (lib.util/query-stage query 0))))))
        (testing `lib.field.resolution/resolve-column-in-metadata
          (let [stage-cols (#'lib.field.resolution/stage-attached-metadata (lib.util/query-stage query 0))]
            (is (=? {:name "NAME", :description "user description", :display-name "user display name"}
                    (#'lib.field.resolution/resolve-column-in-metadata query field-ref stage-cols)))))
        (testing `lib.field.resolution/current-stage-model-metadata
          ;; TODO (Cam 6/23/25) -- not sure why name isn't propagated here =(
          (is (=? {#_:name #_"NAME", :description "user description", :display-name "user display name"}
                  (#'lib.field.resolution/current-stage-model-metadata query 0 field-ref))))
        (testing `lib.field.resolution/previous-stage-or-source-card-metadata
          (is (=? {#_:name #_"NAME", :description "user description", :display-name "user display name"}
                  (#'lib.field.resolution/previous-stage-or-source-card-metadata query -1 field-ref))))
        (testing `lib.field.resolution/resolve-field-ref
          (is (=? {:name "NAME", :description "user description", :display-name "user display name"}
                  (lib.field.resolution/resolve-field-ref query -1 field-ref))))))))

(deftest ^:parallel use-unknown-name-for-display-name-for-fields-that-cant-be-resolved-test
  (let [query     (lib/query meta/metadata-provider (meta/table-metadata :venues))
        field-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 123456789]]
    (mu/disable-enforcement
      (is (=? {:lib/type        :metadata/column
               :lib/source-uuid "00000000-0000-0000-0000-000000000000"
               :name            "Unknown Field"
               :display-name    "Unknown Field"}
              (lib.field.resolution/resolve-field-ref query -1 field-ref))))))

(deftest ^:parallel do-not-propagate-lib-expression-names-from-cards-test
  (testing "Columns coming from a source card should not propagate :lib/expression-name"
    (let [q1      (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                      (lib/with-fields [(meta/field-metadata :venues :price)])
                      (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2)))
          q1-cols (lib/returned-columns q1)
          _       (is (=? [{:name "PRICE"}
                           {:name "double-price", :lib/expression-name "double-price"}]
                          q1-cols)
                      "Sanity check: Card metadata is allowed to include :lib/expression-name")
          mp      (lib.tu/mock-metadata-provider
                   meta/metadata-provider
                   ;; note the missing `dataset-query`!! This means we fall back to `:fields` (this is the key
                   ;; used by the FE)
                   {:cards [{:id          1
                             :database-id (meta/id)
                             :fields      q1-cols}]})
          q2      (lib/query mp (lib.metadata/card mp 1))
          q3      (-> q2
                      (lib/aggregate (lib/count))
                      (lib.tu.notebook/add-breakout {:display-name "double-price"}))]
      (is (=? {:name                         "double-price"
               :lib/expression-name          (symbol "nil #_\"key is not present.\"")
               ;; `:lib/expression-name` should get saved as `:lib/original-expression-name` in case we need it later.
               :lib/original-expression-name "double-price"}
              (lib.field.resolution/resolve-field-ref
               q3
               -1
               [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "double-price"]))))))

(deftest ^:parallel resolve-field-from-card-test
  (let [q1 (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
               (lib/join (meta/table-metadata :reviews)))
        mp (lib.tu/mock-metadata-provider
            meta/metadata-provider
            {:cards [{:id            1
                      :dataset-query q1
                      :name          "Products+Reviews"
                      :type          :model}]})
        q2 (-> (lib/query mp (lib.metadata/card mp 1))
               (as-> query (lib/aggregate query (lib/sum (lib.tu.notebook/find-col-with-spec
                                                          query
                                                          (lib/visible-columns query)
                                                          {}
                                                          {:long-display-name "Price"}))))
               (lib.tu.notebook/add-breakout {:long-display-name "Reviews → Created At"}))]
    (is (=? {:stages [{:source-card 1
                       :aggregation [[:sum
                                      {}
                                      [:field {} "PRICE"]]]
                       :breakout    [[:field {} "Reviews__CREATED_AT"]]}]}
            q2))
    (is (=? {:name "PRICE", :id (meta/id :products :price)}
            (#'lib.field.resolution/resolve-column-name
             q2
             0
             [:field
              {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float}
              "PRICE"])))
    (is (= [{:name "CREATED_AT_2", :lib/source-column-alias "Reviews__CREATED_AT"}
            {:name "sum", :lib/source-column-alias "sum"}]
           (map #(select-keys % [:name :lib/source-column-alias])
                (lib/returned-columns q2))))
    (let [mp (lib.tu/mock-metadata-provider
              mp
              {:cards [{:id            2
                        :dataset-query q2
                        :name          "Products+Reviews Summary"
                        :type          :model}]})
          q3 (lib/query mp (lib.metadata/card mp 2))]
      (is (= [{:name "CREATED_AT_2", :lib/source-column-alias "Reviews__CREATED_AT"}
              {:name "sum", :lib/source-column-alias "sum"}]
             (map #(select-keys % [:name :lib/source-column-alias])
                  (lib/visible-columns q3))))
      (is (=? {:lib/source-column-alias  "Reviews__CREATED_AT"
               :lib/desired-column-alias "Reviews__CREATED_AT"
               :display-name             "Reviews → Created At"}
              (lib.field.resolution/resolve-field-ref
               q3
               0
               [:field
                {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float}
                "Reviews__CREATED_AT"]))))))

(deftest ^:parallel resolve-filter-test
  (let [query (lib/query
               meta/metadata-provider
               {:type     :query
                :database (meta/id)
                :query    {:source-query {:source-query {:source-table (meta/id :orders)
                                                         :aggregation  [[:count]]
                                                         :breakout     [[:field
                                                                         (meta/id :people :source)
                                                                         {:base-type :type/Text, :source-field (meta/id :orders :user-id)}]]
                                                         :filter       [:>
                                                                        [:field (meta/id :orders :quantity) {:base-type :type/Integer}]
                                                                        4]}
                                          :aggregation  [[:count]]
                                          :breakout     [[:field "PEOPLE__via__USER_ID__SOURCE" {:base-type :type/Text}]]
                                          :filter       [:>
                                                         [:field "count" {:base-type :type/Integer}]
                                                         5]}
                           :filter       [:=
                                          [:field "PEOPLE__via__USER_ID__SOURCE" {:base-type :type/Text}]
                                          "Organic"]}})]
    (is (=? [[:= {}
              [:field {} "PEOPLE__via__USER_ID__SOURCE"]
              "Organic"]]
            (lib/filters query -1)))
    (is (=? [{:display-name      "User → Source is Organic"
              :long-display-name "User → Source is Organic"}]
            (map #(lib/display-info query %) (lib/filters query -1))))))
