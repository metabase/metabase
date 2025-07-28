(ns metabase.lib.card-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.breakout-test]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.mocks-31368 :as lib.tu.mocks-31368]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel source-card-infer-metadata-test
  (testing "We should be able to calculate metadata for a Saved Question missing results_metadata"
    (let [query (lib.tu/query-with-source-card)]
      (is (=? [{:id                       (meta/id :checkins :user-id)
                :name                     "USER_ID"
                :lib/source               :source/card
                :lib/source-column-alias  "USER_ID"
                :lib/desired-column-alias "USER_ID"}
               {:name                     "count"
                :lib/source               :source/card
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              (lib/returned-columns query)))
      (testing `lib/display-info
        (is (=? [{:name                   "USER_ID"
                  :display-name           "User ID"
                  :table                  {:name         "My Card"
                                           :display-name "My Card"}
                  :effective-type         :type/Integer
                  :semantic-type          :type/FK
                  :is-calculated          false
                  :is-from-previous-stage false
                  :is-implicitly-joinable false
                  :is-from-join           false}
                 {:name                   "count"
                  :display-name           "Count"
                  :table                  {:name         "My Card"
                                           :display-name "My Card"}
                  :effective-type         :type/Integer
                  :is-from-previous-stage false
                  :is-from-join           false
                  :is-calculated          false
                  :is-implicitly-joinable false}]
                (for [col (lib/returned-columns query)]
                  (lib/display-info query col))))))))

(deftest ^:parallel card-source-query-metadata-test
  (doseq [metadata [(:venues (lib.tu/mock-cards))
                    ;; in some cases [the FE unit tests are broken] the FE is transforming the metadata like this, not
                    ;; sure why but handle it anyway
                    ;; (#29739)
                    (set/rename-keys (:venues (lib.tu/mock-cards)) {:result-metadata :fields})]]
    (testing (str "metadata = \n" (u/pprint-to-str metadata))
      (let [query {:lib/type     :mbql/query
                   :lib/metadata (lib.tu/mock-metadata-provider
                                  meta/metadata-provider
                                  {:cards [metadata]})
                   :database     (meta/id)
                   :stages       [{:lib/type    :mbql.stage/mbql
                                   :source-card (:id metadata)}]}]
        (is (=? (for [col (get-in (lib.tu/mock-cards) [:venues :result-metadata])]
                  (-> col
                      (assoc :lib/source :source/card)
                      (dissoc :fk-target-field-id)))
                (lib/returned-columns query)))))))

(deftest ^:parallel card-results-metadata-merge-metadata-provider-metadata-test
  (testing "Merge metadata from the metadata provider into result-metadata (#30046)"
    (let [query (lib.tu/query-with-source-card-with-result-metadata)]
      (is (=? [{:lib/type                 :metadata/column
                :id                       (meta/id :checkins :user-id)
                :table-id                 (meta/id :checkins)
                :semantic-type            :type/FK
                :lib/desired-column-alias "USER_ID"}
               {:lib/type :metadata/column
                :name     "count"}]
              (lib/returned-columns query))))))

(defn- from [src cols]
  (for [col cols]
    (assoc col :lib/source src)))

(defn- implicitly-joined [cols]
  (from :source/implicitly-joinable cols))

(defn- explicitly-joined [cols]
  (from :source/joins cols))

(defn- cols-of [table]
  (for [col (meta/fields table)]
    (meta/field-metadata table col)))

(defn- sort-cols [cols]
  (sort-by (juxt :id :name :source-alias :lib/desired-column-alias) cols))

(deftest ^:parallel visible-columns-use-result-metadata-test
  (testing "visible-columns should use the Card's `:result-metadata` (regardless of what's actually in the Card)"
    (let [venues-query (lib/query
                        (lib.tu/mock-metadata-provider
                         meta/metadata-provider
                         {:cards [(assoc (:orders (lib.tu/mock-cards)) :dataset-query (lib.tu/venues-query))]})
                        (:orders (lib.tu/mock-cards)))]
      (is (=? (->> (cols-of :orders)
                   sort-cols)
              (sort-cols (get-in (lib.tu/mock-cards) [:orders :result-metadata]))))

      (is (=? (->> (concat (from :source/card (cols-of :orders))
                           (implicitly-joined (cols-of :people))
                           (implicitly-joined (cols-of :products)))
                   sort-cols)
              (sort-cols (lib/visible-columns venues-query)))))))

(deftest ^:parallel returned-columns-31769-test
  (testing "Cards with joins should return correct column metadata/refs (#31769)"
    (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider meta/metadata-provider meta/id)
          card              (lib.metadata/card metadata-provider 1)
          q                 (:dataset-query card)
          cols              (lib/returned-columns q)]
      (is (=? [{:name                         "CATEGORY"
                :lib/source                   :source/joins
                :lib/breakout?                true
                :lib/source-column-alias      "CATEGORY"
                :metabase.lib.join/join-alias "Products"
                :lib/desired-column-alias     "Products__CATEGORY"}
               {:name                     "count"
                :lib/source               :source/aggregations
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              cols))
      (is (=? [[:field {:join-alias "Products"} (meta/id :products :category)]
               [:aggregation {} string?]]
              (map lib.ref/ref cols))))))

(deftest ^:parallel returned-columns-31769-source-card-test
  (testing "Queries with `:source-card`s with joins should return correct column metadata/refs (#31769)"
    (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider)
          card              (lib.metadata/card metadata-provider 1)
          q                 (lib/query metadata-provider card)
          cols              (lib/returned-columns q)]
      (testing ":lib/desired-column-alias in previous stage (or source Card) becomes :lib/source-column-alias in next stage (see below)"
        (is (=? [{:lib/desired-column-alias "Products__CATEGORY"}
                 {:lib/desired-column-alias "count"}]
                (lib/returned-columns (lib/query metadata-provider (:dataset-query card))))))
      (is (=? [{:name                     "CATEGORY"
                :lib/source               :source/card
                :lib/source-column-alias  "Products__CATEGORY"
                :lib/desired-column-alias "Products__CATEGORY"}
               {:name                     "count"
                :lib/source               :source/card
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              cols))
      (is (=? [[:field {:base-type :type/Text} "Products__CATEGORY"]
               [:field {:base-type :type/Integer} "count"]]
              (map lib.ref/ref cols))))))

(deftest ^:parallel returned-columns-31769-source-card-previous-stage-test
  (testing "Queries with `:source-card`s with joins in the previous stage should return correct column metadata/refs (#31769)"
    (let [metadata-provider (lib.tu.mocks-31769/mock-metadata-provider)
          card              (lib.metadata/card metadata-provider 1)
          q                 (-> (lib/query metadata-provider card)
                                lib/append-stage)
          cols              (lib/returned-columns q)]
      (is (=? [{:name                     "CATEGORY"
                :lib/source               :source/previous-stage
                :lib/source-column-alias  "Products__CATEGORY"
                :lib/desired-column-alias "Products__CATEGORY"}
               {:name                     "count"
                :lib/source               :source/previous-stage
                :lib/source-column-alias  "count"
                :lib/desired-column-alias "count"}]
              cols))
      (is (=? [[:field {:base-type :type/Text} "Products__CATEGORY"]
               [:field {:base-type :type/Integer} "count"]]
              (map lib.ref/ref cols))))))

(deftest ^:parallel card-source-query-visible-columns-test
  (testing "Explicitly joined fields do not also appear as implictly joinable"
    (let [base       (lib/query meta/metadata-provider (meta/table-metadata :orders))
          join       (lib/join-clause (meta/table-metadata :products)
                                      [(lib/= (lib/ref (meta/field-metadata :orders :product-id))
                                              (lib/ref (meta/field-metadata :products :id)))])
          query      (lib/join base join)]
      (is (=? (->> (concat (from :source/table-defaults (cols-of :orders))
                           (explicitly-joined (cols-of :products)))
                   sort-cols
                   (map #(dissoc % :name)))
              (->> query lib.metadata.calculation/returned-columns sort-cols)))
      (is (=? (->> (concat (from :source/table-defaults (cols-of :orders))
                           (explicitly-joined (cols-of :products))
                           (implicitly-joined (cols-of :people)))
                   sort-cols)
              (->> query lib.metadata.calculation/visible-columns sort-cols)))
      ;; TODO: Currently if the source-card has an explicit join for a table, those fields will also be duplicated as
      ;; implicitly joinable columns. That should be fixed and this test re-enabled. #33565
      #_(testing "even on nested queries"
          (let [card     (lib.tu/mock-card query)
                provider (lib.tu/metadata-provider-with-mock-card card)
                nested   (lib/query provider (lib.metadata/card provider 1))]
            (is (=? (->> (concat (from :source/card (cols-of :orders))
                                 (from :source/card (cols-of :products)))
                         (map #(dissoc % :id :table-id))
                         sorted)
                    (->> nested lib.metadata.calculation/returned-columns sorted)))

            (is (=? (->> (concat (from :source/card (cols-of :orders))
                                 (from :source/card (cols-of :products)))
                         (map #(dissoc % :id :table-id))
                         (concat (from :source/implicitly-joinable (cols-of :people)))
                         sorted)
                    (->> nested lib.metadata.calculation/visible-columns sorted))))))))

(deftest ^:parallel display-name-of-joined-cards-is-clean-test
  (testing "We get proper field names rather than ids (#27323)"
    (let [query (lib/query (lib.tu/metadata-provider-with-mock-cards) (:products (lib.tu/mock-cards)))
          people-card (:people (lib.tu/mock-cards))
          lhs (m/find-first (comp #{"ID"} :name) (lib/join-condition-lhs-columns query 0 people-card nil nil))
          rhs (m/find-first (comp #{"ID"} :name) (lib/join-condition-rhs-columns query 0 people-card nil nil))
          join-clause (lib/join-clause people-card [(lib/= lhs rhs)])
          query (lib/join query join-clause)
          filter-col (m/find-first (comp #{"Mock people card__ID"} :lib/desired-column-alias)
                                   (lib/filterable-columns query))
          query (-> query
                    (lib/filter (lib/= filter-col 1))
                    (lib/aggregate (lib/distinct filter-col))
                    (as-> $q (lib/breakout $q (m/find-first (comp #{"SOURCE"} :name)
                                                            (lib/breakoutable-columns $q)))))]
      ;; we always use LONG display names when the column came from a previous stage.
      (is (= ["Mock people card → Source"
              "Distinct values of Mock people card → ID"]
             (map #(lib/display-name query %) (lib/returned-columns query))))
      (is (= ["Mock people card → ID is 1"]
             (map #(lib/display-name query %) (lib/filters query)))))))

(deftest ^:parallel card-display-info-test
  (testing "Cards with joins should return correct column metadata/refs (#31769)"
    (let [query (lib.tu.mocks-31769/query)
          card-1  (lib.metadata/card query 1)
          card-2  (lib.metadata/card query 2)]
      (is (= {:name "Card 1", :display-name "Card 1", :long-display-name "Card 1", :is-source-card true}
             (lib/display-info query card-1)))
      (is (= {:name "Card 2", :display-name "Card 2", :long-display-name "Card 2"}
             (lib/display-info query card-2)))
      (is (= {:name "Card 1", :display-name "Card 1", :long-display-name "Card 1", :is-source-card true, :metric? true}
             (lib/display-info query (assoc card-1 :type :metric)))))))

(deftest ^:parallel ->card-metadata-column-test
  (testing ":effective-type is set for columns coming from an aggregation in a card (#47184)"
    (let [col {:lib/type :metadata/column
               :base-type :type/Integer
               :semantic-type :type/Quantity
               :name "count"
               :lib/source :source/aggregations}
          card-id 176
          field nil
          expected-col {:lib/type :metadata/column
                        :base-type :type/Integer
                        :effective-type :type/Integer
                        :semantic-type :type/Quantity
                        :name "count"
                        :lib/card-id 176
                        :lib/source :source/card
                        :lib/source-column-alias "count"
                        :fk-target-field-id nil}]
      (is (=? expected-col
              (#'lib.card/->card-metadata-column meta/metadata-provider col card-id field))))))

(deftest ^:parallel source-card-type-test
  (is (= :model (lib.card/source-card-type (lib.tu/query-with-source-model))))
  (is (= :question (lib.card/source-card-type (lib.tu/query-with-source-card))))
  (is (nil? (lib.card/source-card-type (lib/query meta/metadata-provider (meta/table-metadata :orders))))))

(deftest ^:parallel source-card-is-model?-test
  (is (lib.card/source-card-is-model? (lib.tu/query-with-source-model)))
  (is (not (lib.card/source-card-is-model? (lib.tu/query-with-source-card))))
  (is (not (lib.card/source-card-is-model? (lib/query meta/metadata-provider (meta/table-metadata :orders))))))

(defn preserve-edited-metadata-test-mock-metadata-provider
  "Metadata provider with four Cards:

  - 1 is an MBQL model for VENUES

  - 2 uses 1 as its source

  - 3 is a native query model for VENUES

  - 4 uses 3 as its source

  Specify either `result-metadata-style` OR `result-metadata-fn`. Cards have attached `:result-metadata` from
  `result-metadata-fn` or the function associated with `result-metadata-style`."
  [{:keys [result-metadata-style result-metadata-fn]}]
  (let [result-metadata-fn (or result-metadata-fn
                               (case result-metadata-style
                                 ::mlv2-returned-columns lib.metadata.calculation/returned-columns
                                 ::mlv2-expected-columns lib.metadata.result-metadata/returned-columns
                                 ::legacy-snake-case-qp  (mu/fn :- [:sequential :map]
                                                           [query]
                                                           (for [col (lib.metadata.result-metadata/returned-columns query)]
                                                             (-> col
                                                                 (update-keys (fn [k]
                                                                                (cond-> k
                                                                                  (simple-keyword? k) u/->snake_case_en)))
                                                                 (dissoc :lib/type))))))]
    (as-> meta/metadata-provider mp
      (lib.tu/mock-metadata-provider
       mp
       {:cards [(let [query {:database (meta/id)
                             :type     :query
                             :query    {:source-table (meta/id :venues)}}]
                  {:id              1
                   :dataset-query   query
                   :result-metadata (result-metadata-fn (lib/query mp query))
                   :type            :model})]})
      (lib.tu/mock-metadata-provider
       mp
       {:cards [(let [query {:database (meta/id)
                             :type     :query
                             :query    {:source-table
                                        "card__1"}}]
                  {:id              2
                   :dataset-query   query
                   :result-metadata (result-metadata-fn (lib/query mp query))})
                (let [query {:database (meta/id)
                             :type     :native
                             :native   {:query "select * from venues"}}]
                  {:id              3
                   :database-id     (meta/id)
                   :name            "native-model"
                   :type            :model
                   :dataset-query   query
                   :result-metadata (for [col (result-metadata-fn (lib/query mp (meta/table-metadata :venues)))]
                                      (dissoc col :id :table-id :table_id))})]})
      (lib.tu/mock-metadata-provider
       mp
       {:cards [(let [query {:database (meta/id)
                             :type     :query
                             :query    {:source-table "card__3"}}]
                  {:id              4
                   :database-id     (meta/id)
                   :name            "native-nested"
                   :dataset-query   query
                   :result-metadata (result-metadata-fn (lib/query mp query))})]}))))

;;; adapted from [[metabase.queries.api.card-test/model-card-test-2]]
(deftest ^:parallel preserve-edited-metadata-test
  (testing "Cards preserve their edited metadata"
    (doseq [result-metadata-style [::mlv2-returned-columns ::mlv2-expected-columns ::legacy-snake-case-qp]]
      (testing (str "result metadata style = " (name result-metadata-style))
        (let [mp (preserve-edited-metadata-test-mock-metadata-provider {:result-metadata-style result-metadata-style})]
          (letfn [(only-user-edits [col]
                    (select-keys
                     (update-keys col u/->kebab-case-en)
                     [:name :description :display-name :semantic-type]))
                  (base-type->semantic-type [base-type]
                    (condp #(isa? %2 %1) base-type
                      :type/Integer :type/Quantity
                      :type/Float   :type/Cost
                      :type/Text    :type/Name
                      base-type))
                  (add-user-edits [cols]
                    (let [display-name-key  (if (= result-metadata-style ::legacy-snake-case-qp)
                                              :display_name
                                              :display-name)
                          base-type-key     (if (= result-metadata-style ::legacy-snake-case-qp)
                                              :base_type
                                              :base-type)
                          semantic-type-key (if (= result-metadata-style ::legacy-snake-case-qp)
                                              :semantic_type
                                              :semantic-type)]
                      (for [col cols]
                        (assoc col
                               :description      "user description"
                               display-name-key  "user display name"
                               semantic-type-key (base-type->semantic-type (get col base-type-key)))))
                    (map merge
                         cols
                         (repeat {:description "user description"
                                  (if (= result-metadata-style ::legacy-snake-case-qp)
                                    :display_name
                                    :display-name)
                                  "user display name"})
                         (map (if (= result-metadata-style ::legacy-snake-case-qp)
                                (comp
                                 (fn [x] {:semantic_type x})
                                 base-type->semantic-type
                                 :base_type)
                                (comp
                                 (fn [x] {:semantic-type x})
                                 base-type->semantic-type
                                 :base-type))
                              cols)))]
            (doseq [[query-type card-id nested-id] [[:mbql   1 2]
                                                    [:native 3 4]]]
              (testing (str "query type = " query-type " Model card id = " card-id)
                (let [metadata    (:result-metadata (lib.metadata/card mp card-id))
                      ;; simulate updating metadat with user changed stuff
                      user-edited (add-user-edits metadata)
                      edited-mp   (lib.tu/merged-mock-metadata-provider
                                   mp
                                   {:cards [{:id              card-id
                                             :result-metadata user-edited}]})]
                  (testing "card result metadata"
                    (is (=? [{:name "ID",          :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                             {:name "NAME",        :description "user description", :display-name "user display name", :semantic-type :type/Name}
                             {:name "CATEGORY_ID", :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                             {:name "LATITUDE",    :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                             {:name "LONGITUDE",   :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                             {:name "PRICE",       :description "user description", :display-name "user display name", :semantic-type :type/Quantity}]
                            (map #(update-keys % u/->kebab-case-en)
                                 (:result-metadata (lib.metadata/card edited-mp card-id))))))
                  (testing "user edits are preserved in card"
                    (is (=? [{:name "ID",          :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                             {:name "NAME",        :description "user description", :display-name "user display name", :semantic-type :type/Name}
                             {:name "CATEGORY_ID", :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
                             {:name "LATITUDE",    :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                             {:name "LONGITUDE",   :description "user description", :display-name "user display name", :semantic-type :type/Cost}
                             {:name "PRICE",       :description "user description", :display-name "user display name", :semantic-type :type/Quantity}]
                            (lib.metadata.calculation/returned-columns (lib/query edited-mp (lib.metadata/card edited-mp card-id))))))
                  (testing "nested queries flow user edits"
                    (testing (str "in card id = " nested-id)
                      (let [query (lib/query edited-mp (lib.metadata/card edited-mp nested-id))]
                        (testing query-type
                          (is (= (map only-user-edits user-edited)
                                 (->> (lib.metadata.calculation/returned-columns query)
                                      (map only-user-edits))))
                          (testing "with columns that shadow columns in the model"
                            ;; actually ok if description comes back as nil, it's just not ok if it comes back as "user
                            ;; description"
                            (is (=? [{:name "ID", :display-name "ID", :description (symbol "nil #_\"key is not present.\"")}]
                                    (lib.metadata.calculation/returned-columns
                                     (as-> query query
                                       (lib/expression query "ID" 1)
                                       (lib/with-fields query [(lib/expression-ref query "ID")])))))))))
                    (testing "ad-hoc query"
                      (let [query (lib/query edited-mp (:dataset-query (lib.metadata/card edited-mp nested-id)))]
                        (is (= (map only-user-edits user-edited)
                               (->> (lib.metadata.calculation/returned-columns query)
                                    (map only-user-edits))))
                        (testing "with columns that shadow columns in the model"
                          (is (=? [{:name "ID", :display-name "ID", :description (symbol "nil #_\"key is not present.\"")}]
                                  (lib.metadata.calculation/returned-columns
                                   (as-> query query
                                     (lib/expression query "ID" 1)
                                     (lib/with-fields query [(lib/expression-ref query "ID")]))))))))))))))))))

(deftest ^:parallel source-model-cols-test
  (testing "source-model-cols should not fail in FE usage where Card metadata may not have a query"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id 1, :name "Card 1", :database-id (meta/id)}]})]
      (is (nil? (#'lib.card/source-model-cols mp (lib.metadata/card mp 1)))))))

(deftest ^:parallel do-not-include-join-aliases-in-original-display-names-test
  (let [query (lib.tu.mocks-31368/query-with-legacy-source-card true)]
    (binding [lib.metadata.calculation/*display-name-style* :long]
      (is (=? {:name                      "CATEGORY"
               :display-name              "Products → Category"
               :lib/model-display-name    (symbol "nil #_\"key is not present.\"")
               :lib/original-display-name #(#{(symbol "nil #_\"key is not present.\"")
                                              "Category"} ;I'll accept either as correct.
                                            %)
               :effective-type            :type/Text}
              (m/find-first #(= (:name %) "CATEGORY")
                            (lib/returned-columns query))))
      (testing "If the source card was a model, then propagate its display name as :lib/model-display-name"
        (let [mp    (lib.tu/merged-mock-metadata-provider
                     (lib.metadata/->metadata-provider query)
                     {:cards [{:id 1, :type :model}]})
              query (lib/query mp query)]
          (is (=? {:name                   "CATEGORY"
                   :display-name           "Products → Category"
                   :lib/model-display-name "Products → Category"
                   :lib/original-display-name #(#{(symbol "nil #_\"key is not present.\"")
                                                  "Category"} %)
                   :effective-type         :type/Text}
                  (m/find-first #(= (:name %) "CATEGORY")
                                (lib/returned-columns query)))))))))

(deftest ^:parallel do-not-propagate-lib-expression-names-from-cards-test
  (testing "Columns coming from a source card should not propagate :lib/expression-name"
    (let [q1           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                           (lib/with-fields [(meta/field-metadata :venues :price)])
                           (lib/expression "double-price" (lib/* (meta/field-metadata :venues :price) 2)))
          q1-cols      (lib/returned-columns q1)
          _            (is (=? [{:name "PRICE"}
                                {:name "double-price", :lib/expression-name "double-price"}]
                               q1-cols)
                           "Sanity check: Card metadata is allowed to include :lib/expression-name")
          mp           (lib.tu/mock-metadata-provider
                        meta/metadata-provider
                        ;; note the missing `dataset-query`!! This means we fall back to `:fields` (this is the key
                        ;; used by the FE)
                        {:cards [{:id          1
                                  :database-id (meta/id)
                                  :fields      q1-cols}]})
          card         (lib.metadata/card mp 1)
          q2           (lib/query mp card)]
      (doseq [f [#'lib/returned-columns
                 #'lib/visible-columns]
              :let [double-price (lib.tu.notebook/find-col-with-spec q2 (f q2 card) {} {:display-name "double-price"})]]
        (testing f
          (testing "metadata should not include :lib/expression-name"
            (is (=? {:lib/expression-name (symbol "nil #_\"key is not present.\"")}
                    double-price))))))))

(deftest ^:parallel card-with-join-visible-columns-test
  (let [q1   (lib.tu.macros/mbql-query reviews
               {:joins       [{:source-table $$products
                               :condition    [:= $product-id &Products.products.id]
                               :alias        "Products"
                               :fields       :all}]
                :aggregation [[:distinct &Products.products.id]]
                :breakout    [&Products.!month.created-at]})
        mp   (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:cards [{:id 1, :dataset-query q1}]})
        q2   (lib/query mp (meta/table-metadata :reviews))
        card (lib.metadata/card mp 1)]
    (doseq [f [#'lib/returned-columns
               #'lib/visible-columns]]
      (testing (str f " for a card should NEVER return `:metabase.lib.join/join-alias`, because the join happened within the Card itself.")
        (is (=? [{:name                             "CREATED_AT"
                  :display-name                     "Created At: Month"
                  :lib/card-id                      1
                  :lib/source                       :source/card
                  :lib/original-join-alias          "Products"
                  :metabase.lib.join/join-alias     (symbol "nil #_\"key is not present.\"")
                  :metabase.lib.field/temporal-unit (symbol "nil #_\"key is not present.\"")
                  :inherited-temporal-unit          :month}
                 {:name                         "count"
                  :display-name                 "Distinct values of ID"
                  :lib/card-id                  1
                  :lib/source                   :source/card
                  :lib/original-join-alias      (symbol "nil #_\"key is not present.\"")
                  :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")}]
                (f q2 card)))))))

(deftest ^:parallel do-not-propagate-breakout?-test
  (is (=? [{:name          "USER_ID"
            :lib/source    :source/card
            :lib/breakout? false}
           {:name          "count"
            :lib/source    :source/card
            :lib/breakout? false}]
          (lib/returned-columns (lib.tu/query-with-source-card)))))
