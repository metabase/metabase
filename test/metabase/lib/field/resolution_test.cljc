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
   [metabase.lib.schema.id :as id]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.mocks-31368 :as lib.tu.mocks-31368]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.lib.test-util.uuid-dogs-metadata-provider :as lib.tu.uuid-dogs-metadata-provider]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel col-info-field-literals-test
  (testing "field literals should get the information from the matching `:lib/stage-metadata` if it was supplied"
    ;; `resolve-field-metadata` SHOULD basically be the implementation of `lib/metadata` for a field ref
    (doseq [f [#'lib/metadata
               #'lib.field.resolution/resolve-field-ref]]
      (testing f
        (is (=? {:name                                     "sum"
                 :display-name                             "sum of User ID"
                 :base-type                                :type/Integer
                 :semantic-type                            :type/FK
                 :lib/source                               :source/native
                 ::lib.field.resolution/fallback-metadata? (symbol "nil #_\"key is not present.\"")}
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
               :lib/card-id             3
               :lib/source              :source/card
               :lib/source-column-alias "Field 4"
               :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
              (lib/metadata
               query
               [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} "Field 4"]))))))

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
      (is (=? {:table-id                (meta/id :venues)
               :name                    "grandparent.parent"
               :nfc-path                ["grandparent"]
               :lib/source-column-alias "parent"
               :parent-id               (metabase.lib.field-test/grandparent-parent-child-id :grandparent)
               :id                      (metabase.lib.field-test/grandparent-parent-child-id :parent)
               :visibility-type         :normal}
              (col-info [:field {:lib/uuid (str (random-uuid))} (metabase.lib.field-test/grandparent-parent-child-id :parent)]))))
    (testing "nested-nested fields should include grandparent name (etc)"
      (is (=? {:table-id                (meta/id :venues)
               :name                    "grandparent.parent.child"
               :nfc-path                ["grandparent" "parent"]
               :lib/source-column-alias "child"
               :parent-id               (metabase.lib.field-test/grandparent-parent-child-id :parent)
               :id                      (metabase.lib.field-test/grandparent-parent-child-id :child)
               :visibility-type         :normal}
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
               :lib/card-id             3
               :lib/source              :source/card
               :lib/source-column-alias "Field 4"
               :lib/source-uuid         "aa0e13af-29b3-4c27-a880-a10c33e55a3e"}
              (lib/metadata
               query
               [:field {:lib/uuid "aa0e13af-29b3-4c27-a880-a10c33e55a3e", :base-type :type/Text} 4]))))))

(deftest ^:parallel resolve-not-from-join-in-join-test
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
                                                                      :columns  (lib.card/card-returned-columns mp (lib.metadata/card mp 1))}
                                       :native                       "SELECT * FROM some_table;"
                                       ;; `:qp` and `:source-query` keys get added by QP middleware during preprocessing.
                                       :qp/stage-is-from-source-card 1}
                                      {:lib/type                     :mbql.stage/mbql
                                       :lib/stage-metadata           {:lib/type :metadata/results
                                                                      :columns  (lib.card/card-returned-columns mp (lib.metadata/card mp 2))}
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
      (let [field-ref (first (lib/fields query -1))]
        (is (=? [:field {:lib/uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"} "EXAMPLE_TIMESTAMP"]
                field-ref))
        (testing `lib.field.resolution/options-metadata*
          (is (=? {:lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (#'lib.field.resolution/options-metadata (second field-ref)))))
        (testing `lib.field.resolution/resolve-field-ref
          (is (=? {:lib/card-id     2
                   :lib/source      :source/previous-stage
                   :name            "EXAMPLE_TIMESTAMP"
                   :lib/source-uuid "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
                  (lib.field.resolution/resolve-field-ref query -1 field-ref)))
          (testing "preserve display names from field refs"
            (let [ref' (lib.options/update-options field-ref assoc :display-name "My Cool Timestamp")]
              (is (=? {:name                      "EXAMPLE_TIMESTAMP"
                       :display-name              "My Cool Timestamp"
                       :lib/ref-display-name      "My Cool Timestamp"
                       :lib/original-display-name "Example Timestamp"
                       :lib/source-uuid           "40bb920d-d197-4ed2-ad2f-9400427b0c16"}
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
               :lib/source-uuid                  string?
               :lib/type                         :metadata/column
               :metabase.lib.field/binning       {:strategy :num-bins, :num-bins 10, :bin-width 5, :min-value -100, :max-value 100}
               :metabase.lib.field/temporal-unit :month}
              (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1)))))
      (is (=? [{:display-name "Price: 10 bins: Month"}]
              (lib/returned-columns query -1))))))

(deftest ^:parallel resolve-field-from-explicit-join-test
  (let [query (lib/query
               meta/metadata-provider
               (lib.tu.macros/$ids venues
                 {:type  :query
                  :query {:source-table (meta/id :venues)
                          :fields       [&Categories.categories.name]
                          :joins        [{:alias        "Categories"
                                          :source-table $$categories
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
                    :joins  [{:alias        "Category"
                              :source-table $$categories
                              :condition    [:= $category-id &Category.categories.id]
                              :strategy     :left-join
                              :fk-field-id  %category-id}]}))
          col   (lib.field.resolution/resolve-field-ref query -1 (first (lib/fields query -1)))]
      (is (=? {:lib/original-ref-style-for-result-metadata-purposes :original-ref-style/id}
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
    (let [mp        (lib.tu/mock-metadata-provider
                     meta/metadata-provider
                     {:cards [{:id            1
                               :name          "Model"
                               :type          :model
                               :database-id   (meta/id)
                               :dataset-query (lib.tu.macros/mbql-query venues
                                                {:joins  [{:source-table $$categories
                                                           :alias        "C"
                                                           :condition    [:= &C.categories.id $venues.category-id]}]
                                                 :fields [[:field
                                                           "C__NAME"
                                                           {:base-type     :type/Text
                                                            :temporal-unit :month
                                                            :binning       {:strategy :default}}]]})}]})
          query     (lib/query mp {:type     :query
                                   :database (meta/id)
                                   :query    {:source-table "card__1"}})
          expected  {:base-type                        :type/Text
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
                         :name                    "NAME"
                         :lib/source-column-alias "C__NAME")
                  (lib.field.resolution/resolve-field-ref query -1 field-ref))))
        (testing "With a query that has been preprocessed (current-stage-model-metadata pathway)"
          (let [model-query (lib/query mp (:dataset-query (lib.metadata/card mp 1)))
                query'      (update query :stages (fn [[original-stage]]
                                                    [(-> (first (:stages model-query))
                                                         (assoc :qp/stage-is-from-source-card 1))
                                                     (-> original-stage
                                                         (dissoc :source-card)
                                                         (assoc :qp/stage-had-source-card 1))]))]
            (is (=? [(assoc expected
                            :lib/source-column-alias "C__NAME"
                            :lib/source              :source/previous-stage)]
                    (lib/returned-columns query' -1)))))))))

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
                (first (lib/breakouts-metadata query))))))))

(deftest ^:parallel column-filter-join-alias-test
  (testing "We should be able to resolve a ref missing join alias and add that to the metadata (#36861)"
    (let [query      (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/join (lib/join-clause (meta/table-metadata :products)
                                                    [(lib/= (meta/field-metadata :orders :product-id)
                                                            (meta/field-metadata :products :id))])))
          broken-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Text} "CATEGORY"]]
      (is (=? {:id                           (meta/id :products :category)
               :table-id                     (meta/id :products)
               :name                         "CATEGORY"
               :lib/source                   :source/joins
               :lib/source-column-alias      "CATEGORY"
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

;;; adapted from [[metabase.queries-rest.api.card-test/model-card-test-2]]
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

(deftest ^:parallel fallback-metadata-for-unreturned-field-id-ref-test
  (testing "Fallback metadata for a Field ID ref that is not returned by this query should at least include the actual correct :name"
    (let [query     (lib/query meta/metadata-provider (meta/table-metadata :venues))
          field-ref [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (meta/id :orders :id)]]
      (is (=? {:base-type                                :type/BigInteger
               :display-name                             "ID"
               :effective-type                           :type/BigInteger
               :id                                       (meta/id :orders :id)
               :name                                     "ID"
               :semantic-type                            :type/PK
               :table-id                                 (meta/id :orders)
               :visibility-type                          :normal
               :lib/original-display-name                "ID"
               :lib/original-name                        "ID"
               :lib/source                               :source/table-defaults
               :lib/source-column-alias                  "ID"
               :lib/source-uuid                          "00000000-0000-0000-0000-000000000000"
               :lib/type                                 :metadata/column
               ::lib.field.resolution/fallback-metadata? true}
              (into (sorted-map) (lib.field.resolution/resolve-field-ref query -1 field-ref)))))))

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
            (#'lib.field.resolution/resolve-from-previous-stage-or-source q2 0 "PRICE")))
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
               :lib/original-join-alias  "Reviews"
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

(deftest ^:parallel resolve-aggregation-by-name-test
  (testing "make sure we can resolve a field ref for an aggregation in a previous stage"
    (let [mp    meta/metadata-provider
          query (lib/query
                 mp
                 {:lib/type :mbql/query
                  :database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :orders)
                              :breakout     [[:field
                                              {:base-type :type/Integer}
                                              (meta/id :orders :product-id)]]
                              :aggregation  [[:sum
                                              {}
                                              [:field
                                               {:base-type :type/Integer}
                                               (meta/id :orders :quantity)]]]}
                             {:lib/type :mbql.stage/mbql}]})]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (is (= ["Product ID"
                "Sum of Quantity"]
               (map :display-name (lib/returned-columns query))))
        (is (=? {:display-name "Sum of Quantity"}
                (lib.field.resolution/resolve-field-ref
                 query
                 -1
                 [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "sum"])))))))

(deftest ^:parallel resolve-aggregation-by-name-test-2
  (testing "resolving an aggregation by name should work when aggregation uses a field name ref from previous stage"
    (let [mp    meta/metadata-provider
          query (lib/query
                 mp
                 {:lib/type :mbql/query
                  :database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :orders)
                              :aggregation  [[:count {}]]
                              :breakout     [[:field
                                              {:binning {:strategy :num-bins, :num-bins 10}}
                                              (meta/id :orders :quantity)]
                                             [:field
                                              {:binning {:strategy :num-bins, :num-bins 50}}
                                              (meta/id :orders :quantity)]]}
                             {:lib/type    :mbql.stage/mbql
                              :aggregation [[:min
                                             {}
                                             [:field
                                              {:base-type :type/Integer}
                                              "QUANTITY"]]
                                            [:max
                                             {}
                                             [:field
                                              {:base-type :type/Integer}
                                              "QUANTITY_2"]]]}
                             {:lib/type :mbql.stage/mbql}]})]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (testing "first stage"
          (is (=? [{:display-name             "Quantity: 10 bins"
                    :lib/deduplicated-name    "QUANTITY"
                    :lib/desired-column-alias "QUANTITY"}
                   {:display-name             "Quantity: 50 bins"
                    :lib/deduplicated-name    "QUANTITY_2"
                    :lib/desired-column-alias "QUANTITY_2"}
                   {:lib/deduplicated-name    "count"
                    :lib/desired-column-alias "count"}]
                  (lib/returned-columns query 0))))
        (testing "second stage"
          (is (=? {:display-name "Quantity: 50 bins"}
                  (lib.field.resolution/resolve-field-ref
                   query
                   1
                   [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "QUANTITY_2"])))
          (testing `lib/returned-columns
            (is (=? [{:display-name             "Min of Quantity: 10 bins"
                      :lib/desired-column-alias "min"}
                     {:display-name             "Max of Quantity: 50 bins"
                      :lib/desired-column-alias "max"}]
                    (lib/returned-columns query 1)))))
        (testing "third stage"
          (is (=? {:display-name "Max of Quantity: 50 bins"}
                  (lib.field.resolution/resolve-field-ref
                   query
                   2
                   [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "max"]))))))))

;;; adapted from [[metabase.query-processor.uuid-test/joined-uuid-query-test]]
(deftest ^:parallel resolve-field-missing-join-alias-test
  (testing "should resolve broken refs missing join-alias correctly and return appropriate metadata"
    (let [mp      lib.tu.uuid-dogs-metadata-provider/metadata-provider
          query   (lib/query
                   mp
                   {:database 1
                    :type     :query
                    :query    {:source-table 1                 ; people
                               :joins        [{:source-table 2 ; dogs
                                               :condition    [:=
                                                              [:field #_dogs.person-id 5 {:join-alias "j"}]
                                                              [:field #_people.id 1 nil]]
                                               :alias        "d"
                                               :fields       :all}]}})
          ;; incorrect field ref! Should have the join alias `d`. But we should be able to figure it
          ;; out anyway.
          bad-ref [:field {:base-type :type/UUID, :lib/uuid "00000000-0000-0000-0000-000000000000"} #_dogs.id 4]]
      (testing "Resolve in join in current stage"
        (is (=? {:metabase.lib.join/join-alias "d"}
                (lib.field.resolution/resolve-field-ref query -1 bad-ref))))
      (testing "Resolve in join in previous stage"
        (is (=? {:lib/original-join-alias      "d"
                 :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")}
                (lib.field.resolution/resolve-field-ref (lib/append-stage query) -1 bad-ref)))))))

(deftest ^:parallel resolve-id-ref-to-correct-column-test
  (testing "Should resolve an ID ref to the correct column if there are multiple columns with that name"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :joins        [{:source-table $$products
                                                   :condition    [:= $product-id &Products.products.id]
                                                   :alias        "Products"
                                                   :fields       :all}]}}))]
      (is (=? {:id                      (meta/id :products :id)
               :name                    "ID"
               :table-id                (meta/id :products)
               :lib/source              :source/previous-stage
               :lib/original-join-alias "Products"
               :lib/source-column-alias "Products__ID"}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (meta/id :products :id)]))))))

(deftest ^:parallel resolve-id-ref-to-correct-column-test-2
  (testing "Should NOT resolve an ID ref to the wrong column if the ref is impossible"
    ;; join does not return any fields. Do not resolve to ORDERS.ID
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :joins        [{:source-table $$products
                                                   :condition    [:= $product-id &Products.products.id]
                                                   :alias        "Products"}]}}))]
      (is (=? {:id                                       (meta/id :products :id)
               :name                                     "ID"
               :table-id                                 (meta/id :products)
               ;; TODO (Cam 7/29/25) -- maybe we need to add a `:source/indetermiate` option or something. Because
               ;; this is probably wrong... but nothing else is right either.
               :lib/source                               :source/previous-stage
               ::lib.field.resolution/fallback-metadata? true}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} (meta/id :products :id)]))))))

(defn- resolve-column-from-implicit-join-test-query
  "A query with two implicit joins against `PRODUCTS` using two different FK fields (to make sure we don't get them
  mixed up.)"
  []
  (lib/query
   meta/metadata-provider
   {:lib/type :mbql/query
    :database (meta/id)
    :stages   [{:lib/type     :mbql.stage/mbql
                :aggregation  [[:count {}]]
                :source-table (meta/id :orders)
                :breakout     [;; same ID, but different `:source-field`; make sure we do not resolve
                               ;; to the wrong field. Test them both to make sure each is resolved
                               ;; correctly.
                               [:field
                                {:source-field (meta/id :orders :id)}
                                (meta/id :products :category)]
                               [:field
                                {:source-field (meta/id :orders :product-id)}
                                (meta/id :products :category)]]}
               {:lib/type :mbql.stage/mbql
                :fields   [[:field
                            {:source-field (meta/id :orders :id)}
                            (meta/id :products :category)]
                           [:field
                            ;; having `:source-field` here AGAIN is probably not necessary since the
                            ;; join was actually already done in the previous stage; at any rate we
                            ;; should still return correct info.
                            {:source-field (meta/id :orders :product-id)}
                            (meta/id :products :category)]
                           [:field {:base-type :type/Integer} "count"]]
                :filters  [[:>
                            {}
                            [:field {:base-type :type/Integer} "count"]
                            0]]}
               {:lib/type :mbql.stage/mbql}]}))

(deftest ^:parallel resolve-column-from-implicit-join-test
  (let [query (resolve-column-from-implicit-join-test-query)]
    (testing "PRODUCTS__via__PRODUCT_ID"
      (let [field-ref (lib/normalize
                       :mbql.clause/field
                       [:field {:source-field (meta/id :orders :product-id)} (meta/id :products :category)])]
        (binding [lib.metadata.calculation/*display-name-style* :long]
          (testing "first stage"
            (let [expected {:name         "CATEGORY"
                            :display-name "Product → Category"
                            :lib/source   :source/implicitly-joinable
                            :fk-field-id  (meta/id :orders :product-id)}]
              (is (=? expected
                      (lib.field.resolution/resolve-field-ref query 0 field-ref)))
              ;; 99.9% chance that using a field name ref with `:source-field` is a bad idea and broken, I even
              ;; considered banning it at the schema level, but decided to let it be for now since we should still be
              ;; able to resolve it. This should also work for subsequent stages but you would need to use `CATEGORY_2`
              ;; or `PRODUCTS__via__PRODUCT_ID__CATEGORY` here to make it work; `:source-table` is not even needed at
              ;; that point.
              (testing "should also be able to use a field name ref here if you are a psycho"
                (is (=? expected
                        (lib.field.resolution/resolve-field-ref query 0 (lib/normalize
                                                                         :mbql.clause/field
                                                                         [:field {:source-field (meta/id :orders :product-id)
                                                                                  :base-type    :type/Text}
                                                                          "CATEGORY"])))))))
          ;; actually incorrect to use `:source-field` if the implicit join happened in the previous stage, since
          ;; that's sorta instructing us to perform the implicit join again. Either way we should be able to figure
          ;; out what you meant here.
          (testing "second stage"
            (is (=? {:name                     "CATEGORY"
                     :display-name             "Product → Category"
                     :lib/source               :source/previous-stage
                     :lib/source-column-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                     :fk-field-id              (symbol "nil #_\"key is not present.\"")
                     :lib/original-fk-field-id (meta/id :orders :product-id)}
                    (lib.field.resolution/resolve-field-ref query 1 field-ref))))
          (testing "third stage"
            (is (=? {:name                     "CATEGORY"
                     :display-name             "Product → Category"
                     :lib/source               :source/previous-stage
                     :lib/source-column-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                     :fk-field-id              (symbol "nil #_\"key is not present.\"")
                     :lib/original-fk-field-id (meta/id :orders :product-id)}
                    (lib.field.resolution/resolve-field-ref query 2 field-ref)))))))))

(deftest ^:parallel resolve-column-from-implicit-join-test-2
  (let [query (resolve-column-from-implicit-join-test-query)]
    (testing "PRODUCTS__via__ID"
      (let [field-ref (lib/normalize
                       :mbql.clause/field
                       [:field {:source-field (meta/id :orders :id)} (meta/id :products :category)])]
        (binding [lib.metadata.calculation/*display-name-style* :long]
          (testing "first stage"
            (is (=? {:name         "CATEGORY"
                     :display-name "ID → Category"
                     :lib/source   :source/implicitly-joinable
                     :fk-field-id  (meta/id :orders :id)}
                    (lib.field.resolution/resolve-field-ref query 0 field-ref))))
          (testing "second stage"
            (is (=? {:name                     "CATEGORY"
                     :display-name             "ID → Category"
                     :lib/source               :source/previous-stage
                     :lib/source-column-alias  "PRODUCTS__via__ID__CATEGORY"
                     :fk-field-id              (symbol "nil #_\"key is not present.\"")
                     :lib/original-fk-field-id (meta/id :orders :id)}
                    (lib.field.resolution/resolve-field-ref query 1 field-ref))))
          (testing "third stage"
            (is (=? {:name                     "CATEGORY"
                     :display-name             "ID → Category"
                     :lib/source               :source/previous-stage
                     :lib/source-column-alias  "PRODUCTS__via__ID__CATEGORY"
                     :fk-field-id              (symbol "nil #_\"key is not present.\"")
                     :lib/original-fk-field-id (meta/id :orders :id)}
                    (lib.field.resolution/resolve-field-ref query 2 field-ref)))))))))

(deftest ^:parallel include-fk-field-id-from-join-test
  (testing "If join includes `:fk-field-id`, include it in metadata for `:join-alias` ref"
    (let [query (-> (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query venues
                       {:fields [&Category.categories.id]
                        :joins  [{:alias        "Category"
                                  :source-table $$categories
                                  :condition    [:= $category-id &Category.categories.id]
                                  :strategy     :left-join
                                  :fk-field-id  %category-id}]}))
                    lib/append-stage)]
      (testing "first stage"
        (is (=? {:fk-field-id (meta/id :venues :category-id)}
                (lib.field.resolution/resolve-field-ref
                 query 0
                 (lib/normalize :mbql.clause/field [:field {:join-alias "Category"} (meta/id :categories :id)])))))
      (testing "second stage"
        (is (=? {:fk-field-id              (symbol "nil #_\"key is not present.\"")
                 :lib/original-fk-field-id (meta/id :venues :category-id)}
                (lib.field.resolution/resolve-field-ref
                 query 1
                 (lib/normalize :mbql.clause/field [:field {:base-type :type/Integer} "Category__ID"]))))))))

(deftest ^:parallel propagate-card-fingerprint-test
  (testing "fingerprints in card metadata should get propagated when resolving fields"
    (let [card-query (lib.tu.macros/mbql-query orders
                       {:aggregation [[:avg $subtotal]]
                        :breakout    [$user-id]})
          mp         (lib.tu/mock-metadata-provider
                      meta/metadata-provider
                      {:cards [{:id              1
                                :dataset-query   card-query
                                :result-metadata [(meta/field-metadata :orders :user-id)
                                                  {:base_type                :type/Float
                                                   :display_name             "Average of Subtotal"
                                                   :effective_type           :type/Float
                                                   :fingerprint              {:global {:distinct-count 1721, :nil% 0.0}
                                                                              :type   {:type/Number {:min 30.5
                                                                                                     :q1  69.3417689663785
                                                                                                     :q3  84.32617784582509
                                                                                                     :max 148.17
                                                                                                     :sd  14.270332033504152
                                                                                                     :avg 77.17596365762961}}}
                                                   :name                     "avg"
                                                   :semantic_type            nil
                                                   :lib/deduplicated-name    "avg"
                                                   :lib/desired-column-alias "avg"
                                                   :lib/original-name        "avg"
                                                   :lib/source               :source/aggregations
                                                   :lib/source-column-alias  "avg"}]}]})
          card       (lib.metadata/card mp 1)
          card-cols  (lib/returned-columns (lib/query mp card-query) card)
          _          (is (=? {:name         "avg"
                              :display-name "Average of Subtotal"
                              :lib/source   :source/card
                              :fingerprint  {:type {:type/Number {:min number?, :max number?}}}}
                             (m/find-first #(= (:name %) "avg") card-cols))
                         "Sanity check: card metadata should have fingerprint")
          ;; simulate a preprocessed query where the card source is inlined.
          query      (-> (lib/query mp card-query)
                         lib/append-stage
                         (lib/update-query-stage 0 assoc :qp/stage-is-from-source-card 1)
                         (lib/update-query-stage 1 assoc :qp/stage-had-source-card 1))]
      (is (=? {:name         "avg"
               :display-name "Average of Subtotal"
               :lib/source   :source/previous-stage
               :fingerprint  {:type {:type/Number {:min number?, :max number?}}}}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} "avg"]))))))

(deftest ^:parallel return-correct-metadata-for-broken-field-refs-test
  (testing "Do not propagate join alias in metadata for busted field refs that incorrectly use it (QUE-1496)"
    (let [query     (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query venues
                       {:source-query {:source-table $$venues
                                       :joins        [{:strategy     :left-join
                                                       :source-table $$categories
                                                       :alias        "Cat"
                                                       :condition    [:= $category-id &Cat.categories.id]
                                                       :fields       [&Cat.categories.name]}]
                                       :fields       [$id
                                                      &Cat.categories.name]}
                        ;; THIS REF IS WRONG -- it should not be using `Cat` because the join is in the source query
                        ;; rather than in the current stage. However, we should be smart enough to try to figure out
                        ;; what they meant.
                        :breakout     [&Cat.categories.name]}))
          [bad-ref] (lib/breakouts query -1)]
      ;; maybe one day `lib/query` will automatically fix bad refs like these. If that happens, we probably don't even
      ;; need this test anymore? Or we should update it so it's still testing with a bad ref rather than a fixed ref.
      (is (=? [:field {:join-alias "Cat"} (meta/id :categories :name)]
              bad-ref))
      (is (=? {:table-id                     (meta/id :categories)
               :id                           (meta/id :categories :name)
               :name                         "NAME"
               :lib/original-join-alias      "Cat"
               :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
               :lib/source-column-alias      "Cat__NAME"
               :lib/desired-column-alias     (symbol "nil #_\"key is not present.\"")}
              (lib.field.resolution/resolve-field-ref query -1 bad-ref))))))

(deftest ^:parallel nested-literal-boolean-expression-with-name-collisions-test
  (testing "Don't resolve a `:field` ref to an expression if it has a conflicting name"
    (let [true-value  [:value {:base-type :type/Boolean, :effective-type :type/Boolean, :lib/expression-name "T"} true]
          false-value [:value {:base-type :type/Boolean, :effective-type :type/Boolean, :lib/expression-name "F"} false]
          query       (lib.tu.macros/mbql-5-query nil
                        {:stages [{:source-table $$orders
                                   :expressions  [true-value
                                                  false-value]
                                   :fields       [[:expression {} "T"]
                                                  [:expression {} "F"]]}
                                  {:expressions [true-value
                                                 false-value]
                                   :fields      [[:expression {} "T"]
                                                 [:expression {} "F"]
                                                 [:field {:base-type :type/Boolean} "T"]
                                                 [:field {:base-type :type/Boolean} "F"]]}]})]
      (is (=? {:lib/source                   :source/previous-stage
               :lib/source-column-alias      "T"
               :lib/expression-name          (symbol "nil #_\"key is not present.\"")
               :lib/original-expression-name "T"}
              (lib.field.resolution/resolve-field-ref query -1 [:field
                                                                {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Boolean}
                                                                "T"]))))))

(deftest ^:parallel resolve-incorrect-field-ref-for-expression-test
  (testing "resolve the incorrect use of a field ref correctly"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query venues
                   {:fields      [[:expression "my_numberLiteral"]]
                    :expressions {"my_numberLiteral" [:value 1 {:base_type :type/Integer}]}}))]
      (is (=? {:base-type               :type/Integer
               :display-name            "my_numberLiteral"
               :name                    "my_numberLiteral"
               :lib/expression-name     "my_numberLiteral"
               :lib/source              :source/expressions
               :lib/source-column-alias "my_numberLiteral"
               :lib/source-uuid         "00000000-0000-0000-0000-000000000000"
               :lib/type                :metadata/column}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "my_numberLiteral"]))))))

(deftest ^:parallel resolve-incorrect-field-ref-for-expression-test-2
  (testing "Do not recurse forever if expressions mutually reference one another somehow (#63743)"
    (let [query (lib/query
                 meta/metadata-provider
                 {:lib/type :mbql/query
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :venues)
                              :fields       [[:expression {} "expr_1"]
                                             [:expression {} "expr_2"]]
                              :expressions  [[:field {:base-type :type/Integer, :lib/expression_name "expr_1"} "expr_2"]
                                             [:field {:base-type :type/Integer, :lib/expression_name "expr_2"} "expr_1"]]}]})]
      (is (=? {:base-type               :type/Integer
               :display-name            "expr_2"
               :name                    "expr_2"
               :lib/expression-name     "expr_2"
               :lib/source              :source/expressions
               :lib/source-column-alias "expr_2"
               :lib/source-uuid         "00000000-0000-0000-0000-000000000000"
               :lib/type                :metadata/column}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:base-type :type/Integer, :lib/uuid "00000000-0000-0000-0000-000000000000"} "expr_2"]))))))

(deftest ^:parallel field-name-ref-in-first-stage-test
  (testing "Should be able to resolve a field name ref in the first stage of a query"
    (let [query (lib/query
                 meta/metadata-provider
                 {:lib/type :mbql/query
                  :database (meta/id)
                  :stages   [{:lib/type     :mbql.stage/mbql
                              :source-table (meta/id :products)
                              :fields       [[:field {} (meta/id :products :id)]
                                             [:field {} (meta/id :products :title)]]
                              :filters      [[:=
                                              {}
                                              [:field {:base-type :type/BigInteger} "ID"]
                                              [:value {:base-type :type/BigInteger} 144]]]}]})]
      (is (=? (-> (lib.field.resolution/resolve-field-ref
                   query
                   -1
                   [:field {:base-type :type/BigInteger, :lib/uuid "00000000-0000-0000-0000-000000000000"} (meta/id :products :id)])
                  (dissoc :lib/original-ref-style-for-result-metadata-purposes :lib/original-display-name))
              (lib.field.resolution/resolve-field-ref
               query
               -1
               [:field {:base-type :type/BigInteger, :lib/uuid "00000000-0000-0000-0000-000000000000"} "ID"]))))))

;;; See also [[metabase.query-processor.field-ref-repro-test/model-with-implicit-join-and-external-remapping-test]]
(deftest ^:parallel resolve-unreturned-column-from-reified-implicit-join-in-previous-stage-test
  (let [query     (lib/query
                   meta/metadata-provider
                   {:lib/type :mbql/query
                    :database (meta/id)
                    :stages   [{:lib/type     :mbql.stage/mbql
                                :source-table (meta/id :orders)
                                :fields       [[:field {} (meta/id :orders :user-id)]
                                               [:field {:join-alias "PEOPLE__via__USER_ID"} (meta/id :people :email)]]
                                :joins        [{:lib/type            :mbql/join
                                                :qp/is-implicit-join true
                                                :stages              [{:lib/type     :mbql.stage/mbql
                                                                       :source-table (meta/id :people)}]
                                                :alias               "PEOPLE__via__USER_ID"
                                                :conditions          [[:= {}
                                                                       [:field
                                                                        {}
                                                                        (meta/id :orders :user-id)]
                                                                       [:field
                                                                        {:join-alias "PEOPLE__via__USER_ID"}
                                                                        (meta/id :people :id)]]]
                                                :fk-field-id         (meta/id :orders :user-id)}]}
                               {:lib/type :mbql.stage/mbql}
                               {:lib/type :mbql.stage/mbql}]})
        field-ref [:field
                   {:base-type         :type/Text
                    :join-alias        "PEOPLE__via__USER_ID"
                    :source-field-name "USER_ID"
                    :source-field      (meta/id :orders :user-id)
                    :lib/uuid          "978082dd-2728-4053-b9cc-01bbd64f3507"
                    :effective-type    :type/Text}
                   (meta/id :people :state)]]
    (is (=? {:display-name                             "User → State"
             :effective-type                           :type/Text
             :fingerprint                              some?
             :fk-field-name                            "USER_ID"
             :id                                       (meta/id :people :state)
             :name                                     "STATE"
             :semantic-type                            :type/State
             :table-id                                 (meta/id :people)
             :lib/breakout?                            false
             :lib/original-display-name                "State"
             :lib/original-fk-field-id                 (meta/id :orders :user-id)
             :lib/original-join-name                   "PEOPLE__via__USER_ID"
             :lib/original-name                        "STATE"
             :lib/source                               :source/previous-stage
             :lib/source-column-alias                  "PEOPLE__via__USER_ID__STATE"
             :lib/source-uuid                          "978082dd-2728-4053-b9cc-01bbd64f3507"
             :lib/type                                 :metadata/column
             ::lib.field.resolution/fallback-metadata? true}
            (into (sorted-map) (lib.field.resolution/resolve-field-ref query -1 field-ref))))))

(deftest ^:parallel resolve-inactive-field-ref-test
  (testing "Should be able to resolve an INACTIVE field ref correctly."
    (let [card-query (lib/query
                      meta/metadata-provider
                      (lib.tu.macros/mbql-query orders
                        {:fields [$id $subtotal $tax $total $created-at $quantity]
                         :joins  [{:source-table $$products
                                   :alias        "Product"
                                   :condition    [:=
                                                  $orders.product-id
                                                  [:field %products.id {:join-alias "Product"}]]
                                   :fields       [[:field %products.id {:join-alias "Product"}]
                                                  [:field %products.title {:join-alias "Product"}]
                                                  [:field %products.vendor {:join-alias "Product"}]
                                                  [:field %products.price {:join-alias "Product"}]
                                                  [:field %products.rating {:join-alias "Product"}]]}]}))
          mp         (-> meta/metadata-provider
                         (lib.tu/mock-metadata-provider
                          {:cards [{:id              1
                                    :dataset-query   card-query
                                    :result-metadata (lib/returned-columns card-query)}]})
                         (lib.tu/merged-mock-metadata-provider
                          {:fields (for [field-id [(meta/id :orders :tax) (meta/id :products :vendor)]]
                                     {:id field-id, :active false})}))
          query      (lib/query mp (lib.metadata/card mp 1))]
      (is (=? {:active false
               :id     (meta/id :orders :tax)
               :name   "TAX"}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} "TAX"]))))))

(deftest ^:parallel resolve-inactive-field-ref-by-name-test
  (testing "Should be able to resolve an INACTIVE field ref by name correctly."
    (let [mp    (-> meta/metadata-provider
                    (lib.tu/merged-mock-metadata-provider
                     {:fields (for [field-id [(meta/id :orders :tax) (meta/id :products :vendor)]]
                                {:id field-id, :active false})}))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query orders))]
      (is (=? {:active false
               :id     (meta/id :orders :tax)
               :name   "TAX"}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} "TAX"]))))))

(deftest ^:parallel multiple-remaps-between-tables-test
  (testing "Should be able to resolve multiple FK remaps via different FKs from Table A to Table B in a join"
    (let [mp        (-> meta/metadata-provider
                        (lib.tu/remap-metadata-provider (meta/id :venues :category-id) (meta/id :categories :name)
                                                        (meta/id :venues :id)          (meta/id :categories :name))
                        ;; mock VENUES.ID being an FK to CATEGORIES.ID (required for implicit joins to work)
                        (lib.tu/merged-mock-metadata-provider
                         {:fields [{:id                 (meta/id :venues :id)
                                    :fk-target-field-id (meta/id :categories :id)}]}))
          query     (lib/query
                     mp
                     (lib.tu.macros/mbql-5-query venues
                       {:stages [{:joins [{:alias      "J"
                                           :stages     [{:source-table (meta/id :venues)
                                                         :joins        [{:alias       "CATEGORIES__via__ID"
                                                                         :fk-field-id (meta/id :venues :id)
                                                                         :stages      [{:source-table (meta/id :categories)
                                                                                        :fields       [[:field {} (meta/id :categories :id)]
                                                                                                       [:field {} (meta/id :categories :name)]]}]
                                                                         :conditions  [[:= {} 1 1]]
                                                                         :fields      :none}
                                                                        {:alias       "CATEGORIES__via__CATEGORY_ID"
                                                                         :fk-field-id (meta/id :venues :category-id)
                                                                         :stages      [{:source-table (meta/id :categories)
                                                                                        :fields       [[:field {} (meta/id :categories :id)]
                                                                                                       [:field {} (meta/id :categories :name)]]}]
                                                                         :conditions  [[:= {} 1 1]]
                                                                         :fields      :none}]
                                                         :fields       [[:field
                                                                         {:base-type    :type/Text
                                                                          :join-alias   "CATEGORIES__via__CATEGORY_ID"
                                                                          :source-field (meta/id :venues :category-id)}
                                                                         "NAME"]
                                                                        [:field
                                                                         {:base-type    :type/Text
                                                                          :join-alias   "CATEGORIES__via__ID"
                                                                          :source-field (meta/id :venues :id)}
                                                                         "NAME"]]}]
                                           :conditions [[:= {} 1 1]]
                                           :fields     :none}]}]}))
          field-ref (fn [source-field]
                      [:field {:source-field   source-field
                               :join-alias     "J"
                               :lib/uuid       "c8c84aba-8f84-4ebc-ba0d-6dcdec206538"
                               :base-type      :type/Text
                               :effective-type :type/Text}
                       (meta/id :categories :name)])]
      (binding [lib.metadata.calculation/*display-name-style* :long]
        (testing "ID"
          (let [field-ref (field-ref (meta/id :venues :id))]
            (is (=? {:display-name                 "ID → Name"
                     :id                           (meta/id :categories :name)
                     :semantic-type                :type/Name
                     :lib/deduplicated-name        "NAME_2"
                     :lib/original-fk-field-id    (meta/id :venues :id)
                     :lib/original-join-alias      "J"
                     :lib/original-name            "NAME"
                     :lib/source                   :source/joins
                     :lib/source-column-alias      "CATEGORIES__via__ID__NAME"
                     :metabase.lib.join/join-alias "J"}
                    (lib.field.resolution/resolve-field-ref query 0 field-ref)))))
        (testing "CATEGORY_ID"
          (let [field-ref (field-ref (meta/id :venues :category-id))]
            (is (=? {:display-name                 "Category → Name"
                     :id                           (meta/id :categories :name)
                     :semantic-type                :type/Name
                     :lib/deduplicated-name        "NAME"
                     :lib/original-fk-field-id     (meta/id :venues :category-id)
                     :lib/original-join-alias      "J"
                     :lib/original-name            "NAME"
                     :lib/source                   :source/joins
                     :lib/source-column-alias      "CATEGORIES__via__CATEGORY_ID__NAME"
                     :metabase.lib.join/join-alias "J"}
                    (lib.field.resolution/resolve-field-ref query 0 field-ref)))))))))

(deftest ^:parallel resolve-implicit-column-test
  (testing "fields implicitly joined in a previous stage"
    (let [query (-> (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query venues
                       {:fields   [$category-id->categories.name]
                        :order-by [[:asc $id]]}))
                    lib/append-stage)]
      (is (=? {:id                                       (meta/id :categories :name)
               :table-id                                 (meta/id :categories)
               :lib/original-fk-field-id                 (meta/id :venues :category-id)
               ::lib.field.resolution/fallback-metadata? (symbol "nil #_\"key is not present.\"")}
              (lib.field.resolution/resolve-field-ref query -1 [:field
                                                                {:base-type :type/Text, :effective-type :type/Text, :lib/uuid "ee91656b-08c7-4ca2-9f9e-5845e2edd80a"}
                                                                "CATEGORIES__via__CATEGORY_ID__NAME"]))
          ":fk-field-id needs to get propagated as :lib/previous-stage-fk-field-id this to work correctly"))))

(deftest ^:parallel resolve-by-name-from-join-test
  (let [query (lib/query
               meta/metadata-provider
               {:lib/type :mbql/query
                :stages   [{:lib/type     :mbql.stage/mbql
                            :source-table (meta/id :people)
                            :joins        [{:lib/type   :mbql/join
                                            :strategy   :left-join
                                            :alias      "Q1"
                                            :stages     [{:lib/type     :mbql.stage/mbql
                                                          :source-table (meta/id :orders)
                                                          :fields       [[:field {} (meta/id :orders :id)]
                                                                         [:field {:base-type :type/Integer, :join-alias "O"} "ID"]]
                                                          :joins        [{:lib/type   :mbql/join
                                                                          :strategy   :left-join
                                                                          :alias      "O"
                                                                          :stages     [{:lib/type     :mbql.stage/mbql
                                                                                        :source-table (meta/id :orders)
                                                                                        :fields       [[:field {} (meta/id :orders :id)]]}]
                                                                          :conditions [[:=
                                                                                        {}
                                                                                        [:field {} (meta/id :orders :id)]
                                                                                        [:field {:join-alias "O"} (meta/id :orders :id)]]]
                                                                          :fields     [[:field {:base-type :type/Integer, :join-alias "O"} "ID"]]}]}
                                                         {:lib/type :mbql.stage/mbql
                                                          :fields   [[:field {:base-type :type/BigInteger} "ID"]
                                                                     [:field {:base-type :type/Integer} "O__ID"]]}]
                                            :conditions [[:= {}
                                                          [:field {} (meta/id :people :id)]
                                                          [:field {:base-type :type/BigInteger, :join-alias "Q1"} (meta/id :orders :user-id)]]]
                                            :fields     [[:field {:base-type :type/Integer, :join-alias "Q1"} "ID"]
                                                         [:field {:base-type :type/Integer, :join-alias "Q1"} "o__ID"]]}]
                            :fields       [[:field {} (meta/id :orders :id)]
                                           [:field {:base-type :type/Integer, :join-alias "Q1"} "ID"]
                                           [:field {:base-type :type/Integer, :join-alias "Q1"} "O__ID"]]}]
                :database (meta/id)})]
    (is (=? {:id                                       (meta/id :orders :id)
             :table-id                                 (meta/id :orders)
             :metabase.lib.join/join-alias             "Q1"
             :lib/source-column-alias                  "O__ID"
             ::lib.field.resolution/fallback-metadata? (symbol "nil #_\"key is not present.\"")}
            (lib.field.resolution/resolve-field-ref query -1 [:field {:base-type  :type/Integer
                                                                      :lib/uuid   "00000000-0000-0000-0000-000000000000"
                                                                      :join-alias "Q1"}
                                                              "O__ID"])))))

(deftest ^:parallel fallback-resolve-deduplicated-column-name-to-undeduplicated-name-test
  ;; see https://metaboat.slack.com/archives/C0645JP1W81/p1761241427398479 for more context
  (testing "If a query has something like `CATEGORY` but no `CATEGORY_2` we should resolve a `CATEGORY_2` ref to `CATEGORY`"
    (let [query (lib/query
                 meta/metadata-provider
                 {:lib/type :mbql/query
                  :stages
                  [{:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :products)
                    :expressions  [[:concat
                                    {:lib/uuid "e190e161-cecf-4c33-aba7-767d3540b54c", :lib/expression-name "CATEGORY"}
                                    [:field
                                     {:lib/uuid "20c331ec-949c-4666-ad25-d09148d79614", :base-type :type/Text}
                                     (meta/id :products :category)]
                                    "2"]]
                    :fields       [[:expression
                                    {:base-type :type/Text, :lib/uuid "702e8a86-bd62-4e4c-8b38-5cd67c6d41f3"}
                                    "CATEGORY"]]}
                   {:lib/type    :mbql.stage/mbql
                    :breakout    [[:field
                                   {:lib/uuid "8d3e962d-1593-411d-99ed-c9fb30bf21c6", :base-type :type/Text}
                                   "CATEGORY"]]
                    :aggregation [[:count {:lib/uuid "049bc679-bede-4cae-a28b-0a2b2a18ffd6"}]]
                    :order-by    [[:asc
                                   {:lib/uuid "4d859243-380d-4cef-9841-8edd0d90becc"}
                                   [:field
                                    {:lib/uuid "4e1391f8-3d4c-4c7c-a4cc-723cf15eb18a", :base-type :type/Text}
                                    "CATEGORY"]]]}]
                  :database (meta/id)})
          expected (lib.field.resolution/resolve-field-ref
                    query -1
                    [:field {:lib/uuid "00000000-0000-0000-0000-000000000000" :base-type :type/Number} "CATEGORY"])]
      (is (= expected
             (lib.field.resolution/resolve-field-ref
              query -1
              [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Number} "CATEGORY_2"])))
      (testing "Should be able to resolve nonexistent CATEGORY_3 to existent CATEGORY (i.e., try recursively)"
        (is (= expected
               (lib.field.resolution/resolve-field-ref
                query -1
                [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Number} "CATEGORY_3"])))))))

(deftest ^:parallel fallback-resolve-deduplicated-column-name-to-undeduplicated-name-test-2
  (testing "Should be able to resolve nonexistent `CATEGORY_3` to existent `CATEGORY_2`"
    (let [query (lib/query
                 meta/metadata-provider
                 {:lib/type :mbql/query
                  :stages
                  [{:lib/type     :mbql.stage/mbql
                    :source-table (meta/id :products)
                    :expressions  [[:concat
                                    {:lib/uuid "e190e161-cecf-4c33-aba7-767d3540b54c", :lib/expression-name "CATEGORY"}
                                    [:field
                                     {:lib/uuid "20c331ec-949c-4666-ad25-d09148d79614", :base-type :type/Text}
                                     (meta/id :products :category)]
                                    "2"]]
                    :fields       [[:field
                                    {:base-type :type/Text, :lib/uuid "5a26b338-dbf2-4586-82f5-08d1eafde373"}
                                    "CATEGORY"]
                                   [:expression
                                    {:base-type :type/Text, :lib/uuid "702e8a86-bd62-4e4c-8b38-5cd67c6d41f3"}
                                    "CATEGORY"]]}
                   {:lib/type    :mbql.stage/mbql
                    :breakout    [[:field
                                   {:lib/uuid "8d3e962d-1593-411d-99ed-c9fb30bf21c6", :base-type :type/Text}
                                   "CATEGORY_2"]]
                    :aggregation [[:count {:lib/uuid "049bc679-bede-4cae-a28b-0a2b2a18ffd6"}]]
                    :order-by    [[:asc
                                   {:lib/uuid "4d859243-380d-4cef-9841-8edd0d90becc"}
                                   [:field
                                    {:lib/uuid "4e1391f8-3d4c-4c7c-a4cc-723cf15eb18a", :base-type :type/Text}
                                    "CATEGORY_2"]]]}]
                  :database (meta/id)})]
      (is (=? {:lib/deduplicated-name                    "CATEGORY_2"
               :lib/original-expression-name             "CATEGORY"
               :lib/original-name                        "CATEGORY"
               :lib/source-column-alias                  "CATEGORY_2"
               ::lib.field.resolution/fallback-metadata? (symbol "nil #_\"key is not present.\"")}
              (lib.field.resolution/resolve-field-ref
               query -1
               [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Number} "CATEGORY_3"]))))))

(deftest ^:parallel resolve-in-implicit-join-should-use-source-field-join-alias-test
  (testing "resolve-field-ref should use :source-field-join-alias to disambiguate implicit joins through different explicit joins"
    ;; Two-stage query. Stage 0 has orders with an explicit join to orders ("Orders"),
    ;; plus two implicitly-joinable products.category columns (one from the base table's
    ;; product-id, one from the "Orders" join's product-id). We add both as fields, then
    ;; append a stage. resolve-field-ref in stage 1 should use :source-field-join-alias
    ;; to pick the correct column from the previous stage.
    (let [base-query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                        [(lib/= (meta/field-metadata :orders :product-id)
                                                                (meta/field-metadata :orders :product-id))])
                                       (lib/with-join-alias "Orders")
                                       (lib/with-join-fields :none))))
          ;; Find the two implicitly-joinable products.category columns:
          ;; one with :fk-join-alias nil (base table) and one with "Orders" (join)
          all-cols      (lib/visible-columns base-query)
          category-cols (filter #(and (= (:id %) (meta/id :products :category))
                                      (= (:lib/source %) :source/implicitly-joinable)
                                      (= (:fk-field-id %) (meta/id :orders :product-id)))
                                all-cols)
          base-col      (m/find-first #(nil? (:fk-join-alias %)) category-cols)
          join-col      (m/find-first #(= "Orders" (:fk-join-alias %)) category-cols)
          _             (assert base-col "should find implicitly-joinable category from base table")
          _             (assert join-col "should find implicitly-joinable category from Orders join")
          ;; Add both as fields and append a second stage
          query         (-> base-query
                            (lib/with-fields [base-col join-col])
                            mock-preprocess
                            lib/append-stage)
          base-ref      (lib/ref base-col)
          base-ref-opts (lib.options/options base-ref)
          join-ref      (lib/ref join-col)
          join-ref-opts (lib.options/options join-ref)
          ;; Get stage-0 category columns for assertions
          stage-0-cols      (lib.metadata.calculation/returned-columns query 0)
          stage-0-cat-cols (filter #(= (:id %) (meta/id :products :category)) stage-0-cols)
          stage-0-base-cat (m/find-first (comp nil?        :fk-join-alias) stage-0-cat-cols)
          stage-0-join-cat (m/find-first (comp #{"Orders"} :fk-join-alias) stage-0-cat-cols)]
      ;; Verify refs differ only in :source-field-join-alias
      (is (nil? (:source-field-join-alias base-ref-opts))
          "base table ref should not have :source-field-join-alias")
      (is (= "Orders" (:source-field-join-alias join-ref-opts))
          "join ref should have :source-field-join-alias \"Orders\"")
      (is (mr/validate ::id/field (:source-field base-ref-opts))
          ":source-field should be a valid field ID")
      (is (= (dissoc base-ref-opts :source-field-join-alias :lib/uuid)
             (dissoc join-ref-opts  :source-field-join-alias :lib/uuid))
          "refs differ only in :source-field-join-alias")
      ;; Verify stage 0 has two category columns with different desired aliases
      (is (some? stage-0-base-cat)
          "stage 0 should have a category column without :fk-join-alias")
      (is (some? stage-0-join-cat)
          "stage 0 should have a category column with :fk-join-alias \"Orders\"")
      (is (not= (:lib/desired-column-alias stage-0-base-cat)
                (:lib/desired-column-alias stage-0-join-cat))
          "the two stage-0 category columns should have different desired aliases")
      ;; resolve-field-ref should pick the previous-stage column whose :fk-join-alias matches.
      ;; :lib/source-column-alias comes from the matched column's :lib/desired-column-alias,
      ;; so it reveals which column was actually resolved.
      (testing "ref with :source-field-join-alias should resolve to the column with matching :fk-join-alias"
        (is (= (:lib/desired-column-alias stage-0-join-cat)
               (:lib/source-column-alias  (lib.field.resolution/resolve-field-ref query 1 join-ref))))))))

(deftest ^:parallel resolve-in-implicit-join-should-use-source-field-name-test
  (testing "resolve-field-ref should use :source-field-name to disambiguate implicit joins through differently-aliased FK columns"
    ;; Three-stage query. Stage 0 has ORDERS joined to itself as "Orders", with PRODUCT_ID
    ;; included in the join's fields. This gives two PRODUCT_ID columns with different desired
    ;; aliases. Stage 1 inherits both as differently-aliased FK columns, making them
    ;; distinguishable by :fk-field-name (and thus :source-field-name in refs). We select
    ;; implicitly-joinable PRODUCTS.CATEGORY from both, then append stage 2 to test resolution.
    (let [product-id-field (meta/field-metadata :orders :product-id)
          raw-fk-name      (:name product-id-field)
          base-query       (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                               (lib/join (-> (lib/join-clause (meta/table-metadata :orders)
                                                              [(lib/= product-id-field product-id-field)])
                                             (lib/with-join-alias "Orders")
                                             (lib/with-join-fields [(lib/with-join-alias product-id-field "Orders")]))))
          stage-1-query    (-> base-query mock-preprocess lib/append-stage)
          ;; At stage 1, inherited FK columns have different :fk-field-name values.
          ;; Find the two implicitly-joinable PRODUCTS.CATEGORY columns they produce.
          all-cols-1  (lib/visible-columns stage-1-query)
          cat-cols-1  (filter #(and (= (:id %) (meta/id :products :category))
                                    (= (:lib/source %) :source/implicitly-joinable)
                                    (= (:fk-field-id %) (meta/id :orders :product-id)))
                              all-cols-1)
          base-cat    (m/find-first #(= raw-fk-name (:fk-field-name %)) cat-cols-1)
          renamed-cat (m/find-first #(and (some? (:fk-field-name %))
                                          (not= raw-fk-name (:fk-field-name %)))
                                    cat-cols-1)
          _           (assert base-cat "should find implicitly-joinable category from base PRODUCT_ID")
          _           (assert renamed-cat "should find implicitly-joinable category from renamed PRODUCT_ID")
          ;; Select both at stage 1, mock-preprocess, append stage 2
          query            (-> stage-1-query
                               (lib/with-fields [base-cat renamed-cat])
                               mock-preprocess
                               lib/append-stage)
          base-ref         (lib/ref base-cat)
          base-ref-opts    (lib.options/options base-ref)
          renamed-ref      (lib/ref renamed-cat)
          renamed-ref-opts (lib.options/options renamed-ref)
          ;; Get stage-1 category columns for assertions
          stage-1-cols        (lib.metadata.calculation/returned-columns query 1)
          stage-1-cat-cols    (filter #(= (:id %) (meta/id :products :category)) stage-1-cols)
          stage-1-base-cat    (m/find-first #(= raw-fk-name (:fk-field-name %)) stage-1-cat-cols)
          stage-1-renamed-cat (m/find-first #(and (some? (:fk-field-name %))
                                                  (not= raw-fk-name (:fk-field-name %)))
                                            stage-1-cat-cols)]
      ;; Verify refs differ only in :source-field-name
      (is (not= (:source-field-name base-ref-opts) (:source-field-name renamed-ref-opts))
          "refs should have different :source-field-name values")
      (is (mr/validate ::id/field (:source-field base-ref-opts))
          ":source-field should be a valid field ID")
      (is (= (:source-field base-ref-opts) (:source-field renamed-ref-opts))
          "both refs have the same :source-field")
      (is (= (dissoc base-ref-opts :source-field-name :lib/uuid)
             (dissoc renamed-ref-opts :source-field-name :lib/uuid))
          "refs differ only in :source-field-name")
      ;; Verify stage 1 has two category columns with different desired aliases
      (is (some? stage-1-base-cat)
          "stage 1 should have a category column with :fk-field-name matching raw field name")
      (is (some? stage-1-renamed-cat)
          "stage 1 should have a category column with :fk-field-name different from raw field name")
      (is (not= (:lib/desired-column-alias stage-1-base-cat)
                (:lib/desired-column-alias stage-1-renamed-cat))
          "the two stage-1 category columns should have different desired aliases")
      ;; resolve-field-ref should use :source-field-name to pick the correct column.
      ;; :lib/source-column-alias comes from the matched column's :lib/desired-column-alias,
      ;; so it reveals which column was actually resolved.
      (testing "ref with :source-field-name should resolve to the column with matching :fk-field-name"
        (is (= (:lib/desired-column-alias stage-1-renamed-cat)
               (:lib/source-column-alias (lib.field.resolution/resolve-field-ref query 2 renamed-ref))))))))
