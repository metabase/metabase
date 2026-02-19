(ns metabase.query-processor.preprocess-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.card :as lib.card]
   [metabase.lib.card-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.result-metadata :as lib.metadata.result-metadata]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.humanization :as u.humanization]))

(deftest preprocess-caching-test
  (testing "`preprocess` should work the same even if query has cached results (#18579)"
    ;; make a copy of the `test-data` DB so there will be no cache entries from previous test runs possibly affecting
    ;; this test.
    (mt/with-temp-copy-of-db
      (let [query            (assoc (mt/mbql-query venues {:order-by [[:asc $id]], :limit 5})
                                    :cache-strategy {:type             :ttl
                                                     :multiplier       60
                                                     :avg-execution-ms 100
                                                     :min-duration-ms  0})
            run-query        (fn []
                               (let [results (qp/process-query query)]
                                 {:cached?  (boolean (:cached (:cache/details results)))
                                  :num-rows (count (mt/rows results))}))
            expected-results (qp.preprocess/preprocess query)]
        (testing "Check preprocess before caching to make sure results make sense"
          (is (=? {:database (mt/id)}
                  expected-results)))
        (testing "Run the query a few of times so we know it's cached"
          (testing "first run"
            (is (= {:cached?  false
                    :num-rows 5}
                   (run-query))))
          (testing "should be cached now"
            (is (= {:cached?  true
                    :num-rows 5}
                   (run-query))))
          (testing "preprocess should return same results even when query was cached."
            (is (= (lib.schema.util/remove-lib-uuids expected-results)
                   (lib.schema.util/remove-lib-uuids (qp.preprocess/preprocess query))))))))))

(driver/register! ::custom-escape-spaces-to-underscores :parent :h2)

(defmethod tx/create-db! ::custom-escape-spaces-to-underscores
  [& _]
  ;; no-op since we should be able to reuse the data from H2 tests
  nil)

(defmethod tx/destroy-db! ::custom-escape-spaces-to-underscores
  [& _]
  ;; no-op since we don't want to stomp on data used by H2 tests
  nil)

(defmethod driver/escape-alias ::custom-escape-spaces-to-underscores
  [driver field-alias]
  (-> ((get-method driver/escape-alias :h2) driver field-alias)
      (str/replace #"\s" "_")))

(deftest ^:parallel query->expected-cols-test
  (testing "field_refs in expected columns have the original join aliases (#30648)"
    (mt/dataset test-data
      (binding [driver/*driver* ::custom-escape-spaces-to-underscores]
        (let [query
              (mt/mbql-query
                products
                {:joins
                 [{:source-query
                   {:source-table $$orders
                    :joins
                    [{:source-table $$people
                      :alias "People"
                      :condition [:= $orders.user_id &People.people.id]
                      :fields [&People.people.address]
                      :strategy :left-join}]
                    :fields [$orders.id &People.people.address]}
                   :alias "Question 54"
                   :condition [:= $id [:field %orders.id {:join-alias "Question 54"}]]
                   :fields [[:field %orders.id {:join-alias "Question 54"}]
                            [:field %people.address {:join-alias "Question 54"}]]
                   :strategy :left-join}]
                 :fields
                 [!default.created_at
                  [:field %orders.id {:join-alias "Question 54"}]
                  [:field %people.address {:join-alias "Question 54"}]]})]
          (is (=? [{:name "CREATED_AT"
                    :field_ref [:field (mt/id :products :created_at) {:temporal-unit :default}]
                    :display_name "Created At"}
                   {:name "ID"
                    :field_ref [:field (mt/id :orders :id) {:join-alias "Question 54"}]
                    :display_name "Question 54 → ID"}
                   {:name "ADDRESS"
                    :field_ref [:field (mt/id :people :address) {:join-alias "Question 54"}]
                    :display_name "Question 54 → Address"}]
                  (qp.preprocess/query->expected-cols query))))))))

(deftest ^:parallel deduplicate-column-names-test
  (testing "`query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp.preprocess/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins
                          [{:fields       :all
                            :alias        "u"
                            :source-table $$users
                            :condition    [:= $user_id &u.users.id]}]})))))))

(deftest ^:parallel model-display-names-test
  (testing "Preserve display names from models"
    (let [native-cols (for [col [{:name "EXAMPLE_TIMESTAMP", :base_type :type/DateTime}
                                 {:name "EXAMPLE_DATE", :base_type :type/Date}
                                 {:name "EXAMPLE_WEEK_NUMBER", :base_type :type/Integer}
                                 {:name "EXAMPLE_WEEK", :base_type :type/DateTime}]]
                        (assoc col :display_name (:name col)))
          expected-display-names ["Example Timestamp"
                                  "Example Date"
                                  "Example Week Number"
                                  "Example Week: Week"]
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
                                          [:field "EXAMPLE_DATE" {:base-type :type/Date}]
                                          [:field "EXAMPLE_WEEK_NUMBER" {:base-type :type/Integer}]
                                          [:field "EXAMPLE_WEEK" {:base-type :type/DateTime, :temporal-unit :week}]]
                                 :source-table "card__1"})]
                    {:id              2
                     :type            :model
                     :name            "MODEL"
                     :database-id     (meta/id)
                     :dataset-query   query
                     :result-metadata (for [col (annotate/expected-cols (lib/query mp query))]
                                        (assoc col :display_name (u.humanization/name->human-readable-name :simple (:name col))))})]})
               ;; Card 3 is a model that uses Card 2 (also a model) as a source
               (lib.tu/mock-metadata-provider
                mp
                {:cards
                 [(let [query (lib.tu.macros/mbql-query nil {:source-table "card__2"})]
                    {:id              3
                     :type            :model
                     :name            "METAMODEL"
                     :database-id     (meta/id)
                     :dataset-query   query
                     ;; make sure we're getting metadata for the PREPROCESSED query.
                     :result-metadata (qp.preprocess/query->expected-cols (lib/query mp query))})]}))]
      (testing "Model (Card 2) saved result metadata"
        (is (= ["Example Timestamp"
                "Example Date"
                "Example Week Number"
                "Example Week"]
               (map :display_name (:result-metadata (lib.metadata/card mp 2))))))
      (testing "Model => Model (Card 3) saved result metadata"
        (is (= expected-display-names
               (map :display_name (:result-metadata (lib.metadata/card mp 3))))))
      (testing "Ad-hoc Query with Model => Model (Card 3) as source result metadata"
        (is (= expected-display-names
               (map :display_name (qp.preprocess/query->expected-cols (lib/query mp (lib.metadata/card mp 3))))))))))

(deftest ^:parallel temporal-unit-in-display-name-test
  (testing "Columns bucketed on first stage have bucket in display name on following stage/s"
    (let [mp meta/metadata-provider
          q1 (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                 (lib/aggregate (lib/count))
                 (lib/breakout (lib/with-temporal-bucket
                                 (lib.metadata/field mp (meta/id :orders :created-at))
                                 :quarter))
                 (lib/breakout (lib/with-temporal-bucket
                                 (lib.metadata/field mp (meta/id :orders :created-at))
                                 :day-of-week)))
          q2 (lib/append-stage q1)]
      (is (= ["Created At: Quarter"
              "Created At: Day of week"
              "Count"]
             (map :display_name (qp.preprocess/query->expected-cols q2)))))))

(deftest ^:parallel propagate-join-aliases-in-display-names-test
  (testing "Join aliases from prior stages should get propagated in display names"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:fields [$id $subtotal $tax $total $created-at $quantity]
                                             :joins  [{:source-table $$products
                                                       :alias        "Product"
                                                       :condition
                                                       [:= $orders.product-id
                                                        [:field %products.id {:join-alias "Product"}]]
                                                       :fields
                                                       [[:field %products.id {:join-alias "Product"}]
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
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query orders
                   {:source-table "card__2"
                    :aggregation  [[:sum [:field "TOTAL" {:base-type :type/Float}]]]
                    :breakout     [[:field "RATING" {:base-type :type/Float}]]}))]
      (is (=? [{:display_name "Product → Rating"}
               {:display_name "Sum of Total"}]
              (qp.preprocess/query->expected-cols query))))))

;;; adapted from [[metabase.queries-rest.api.card-test/model-card-test-2]]
;;; and [[metabase.lib.card-test/preserve-edited-metadata-test]]
(deftest ^:parallel preserve-edited-metadata-test
  (testing "Cards preserve their edited metadata"
    (let [mp                       (metabase.lib.card-test/preserve-edited-metadata-test-mock-metadata-provider
                                    {:result-metadata-fn qp.preprocess/query->expected-cols})
          metadata                 (:result-metadata (lib.metadata/card mp 1))
          base-type->semantic-type (fn [base-type]
                                     (condp #(isa? %2 %1) base-type
                                       :type/Integer :type/Quantity
                                       :type/Float   :type/Cost
                                       :type/Text    :type/Name
                                       base-type))
          add-user-edits           (fn [cols]
                                     (for [col cols]
                                       (assoc col
                                              :description   "user description"
                                              :display_name  "user display name"
                                              :semantic_type (base-type->semantic-type (:base_type col)))))
          user-edited              (add-user-edits metadata)
          edited-mp                (lib.tu/merged-mock-metadata-provider
                                    mp
                                    {:cards [{:id              1
                                              :result-metadata user-edited}]})]
      (is (=? [{:name "ID",          :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
               {:name "NAME",        :description "user description", :display-name "user display name", :semantic-type :type/Name}
               {:name "CATEGORY_ID", :description "user description", :display-name "user display name", :semantic-type :type/Quantity}
               {:name "LATITUDE",    :description "user description", :display-name "user display name", :semantic-type :type/Cost}
               {:name "LONGITUDE",   :description "user description", :display-name "user display name", :semantic-type :type/Cost}
               {:name "PRICE",       :description "user description", :display-name "user display name", :semantic-type :type/Quantity}]
              (lib.card/saved-question-metadata edited-mp 1)))
      (doseq [card-id [1 2]]
        (testing (format "Card ID = %d" card-id)
          (is (=? [{:name "ID",          :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                   {:name "NAME",        :description "user description", :display_name "user display name", :semantic_type :type/Name}
                   {:name "CATEGORY_ID", :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                   {:name "LATITUDE",    :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                   {:name "LONGITUDE",   :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                   {:name "PRICE",       :description "user description", :display_name "user display name", :semantic_type :type/Quantity}]
                  (qp.store/with-metadata-provider edited-mp
                    (qp.preprocess/query->expected-cols
                     {:database (meta/id)
                      :type     :query
                      :query    {:source-table (format "card__%d" card-id)}}))))))
      (testing "respect :metadata/model-metadata"
        (let [card  (lib.metadata/card edited-mp 1)
              query (-> (:dataset-query card)
                        (assoc-in [:info :metadata/model-metadata] (:result-metadata card)))]
          (is (=? [{:name "ID",          :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                   {:name "NAME",        :description "user description", :display_name "user display name", :semantic_type :type/Name}
                   {:name "CATEGORY_ID", :description "user description", :display_name "user display name", :semantic_type :type/Quantity}
                   {:name "LATITUDE",    :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                   {:name "LONGITUDE",   :description "user description", :display_name "user display name", :semantic_type :type/Cost}
                   {:name "PRICE",       :description "user description", :display_name "user display name", :semantic_type :type/Quantity}]
                  (qp.preprocess/query->expected-cols (lib/query mp query)))))))))

(deftest ^:parallel do-not-return-join-alias-for-implicit-joins-test
  (let [query (lib/query
               meta/metadata-provider
               (lib.tu.macros/mbql-query orders
                 {:aggregation [[:count]]
                  :breakout    [[:field %products.created-at {:source-field %product-id, :temporal-unit :month}]
                                [:field %products.category {:source-field %product-id}]]}))]
    ;; actually, ok just to not return `:source-alias`, which is used for mysterious FE legacy historical purposes. We
    ;; can go ahead and return various Lib keys for Lib purposes.
    ;;
    ;; NOTE: As of 2025-02-09 `:source-alias` is removed completely so we ESPECIALLY should not be returning it now.
    (doseq [col (qp.preprocess/query->expected-cols query)]
      (testing (pr-str (:name col))
        (is (not (contains? col :source-alias)))))
    (testing "result metadata should still contain fk_field_id"
      (is (=? [{:fk_field_id (meta/id :orders :product-id)}
               {:fk_field_id (meta/id :orders :product-id)}
               {}]
              (qp.preprocess/query->expected-cols query))))
    (testing "display name should include name of implicitly joined table"
      (is (=? ["Product → Created At: Month"
               "Product → Category"
               "Count"]
              (map :display_name (qp.preprocess/query->expected-cols query)))))))

(deftest ^:parallel multiple-joins-correct-fields-test
  (testing "Do not add a duplicate column from a join if it uses :default temporal bucketing"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :database-id   (meta/id)
                           :name          "QB Binning"
                           :dataset-query (lib.tu.macros/mbql-query orders
                                            {:joins  [{:source-table (meta/id :people)
                                                       :alias        "People"
                                                       :condition    [:=
                                                                      $user-id
                                                                      &People.people.id]
                                                       :fields       [&People.people.longitude
                                                                      &People.!default.people.birth-date]}
                                                      {:source-table (meta/id :products)
                                                       :alias        "Products"
                                                       :condition    [:=
                                                                      $product-id
                                                                      &Products.products.id]
                                                       :fields       [&Products.products.price]}]
                                             :fields [$id]})}]})
          query (lib/query mp (lib.metadata/card mp 1))]
      (is (=? {:query {:fields [[:field "ID"                 {:base-type :type/BigInteger}]
                                [:field "People__LONGITUDE"  {:base-type :type/Float}]
                                [:field "People__BIRTH_DATE" {:base-type :type/Date, :inherited-temporal-unit :default}]
                                [:field "Products__PRICE"    {:base-type :type/Float}]]}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL)))
      (is (= [;; orders.id, from :fields
              "ID"
              ;; from the People join :fields
              "People → Longitude"
              "People → Birth Date"
              ;; from the Products join :fields
              "Products → Price"]
             (map :display_name
                  (qp.preprocess/query->expected-cols query)))))))

(deftest ^:parallel return-correct-deduplicated-names-test
  (testing "Deduplicated names from previous stage should be preserved even when excluding certain fields"
    ;; e.g. a field called CREATED_AT_2 in the previous stage should continue to be called that. See ;; see
    ;; https://metaboat.slack.com/archives/C0645JP1W81/p1750961267171999
    (let [q1    (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :aggregation  [[:count]]
                                   :breakout     [[:field %created-at {:base-type :type/DateTime, :temporal-unit :year}]
                                                  [:field %created-at {:base-type :type/DateTime, :temporal-unit :month}]]}
                    :filter       [:>
                                   [:field "count" {:base-type :type/Integer}]
                                   0]}))
          mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query q1}]})
          q2    (lib/query mp (lib.metadata/card mp 1))
          mp    (lib.tu/mock-metadata-provider
                 mp
                 {:cards [{:id            2
                           :dataset-query q2}]})
          query (-> (lib/query mp (lib.metadata/card mp 2))
                    (as-> query (lib/remove-field query -1 (first (lib/fieldable-columns query -1)))))]
      (testing `lib/returned-columns
        (is (=? [{:name "CREATED_AT_2", :display-name "Created At: Month"}
                 {:name "count", :display-name "Count"}]
                (lib/returned-columns query))))
      (testing `lib.metadata.result-metadata/returned-columns
        (is (=? [{:name                                            "CREATED_AT_2"
                  :display-name                                    "Created At: Month"
                  :metabase.lib.metadata.result-metadata/field-ref [:field "CREATED_AT_2" {}]}
                 {:name                                            "count"
                  :display-name                                    "Count"
                  :metabase.lib.metadata.result-metadata/field-ref [:field "count" {}]}]
                (lib.metadata.result-metadata/returned-columns query))))
      (testing `qp.preprocess/query->expected-cols
        ;; I think traditionally this field ref would have used a Field ID, and `:field_ref` should aim to preserve
        ;; the traditional response as much as possible. It only comes back as a ID ref here because the preprocessing
        ;; middleware that adds implicit columns adds the `:qp/added-implicit-fields?` key which
        ;; causes [[metabase.lib.metadata.result-metadata/super-broken-legacy-field-ref]] to force ID refs
        (is (=? [{:name "CREATED_AT_2", :display_name "Created At: Month", :field_ref [:field (meta/id :orders :created-at) nil]}
                 {:name "count", :display_name "Count", :field_ref [:field "count" {}]}]
                (qp.preprocess/query->expected-cols query)))))))

(deftest ^:parallel filter-on-implicitly-joined-column-test
  (testing "Should be able to remove a column that was implicitly joined from a column in an explicit join (#59695)"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:cards [{:id            1
                           :dataset-query (lib.tu.macros/mbql-query orders)}]})
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query nil
                   {:source-table "card__1"
                    :joins        [{:source-table (meta/id :checkins)
                                    :fields       :all
                                    :strategy     :left-join
                                    :alias        "CH"
                                    :condition    [:=
                                                   [:field "ID" {:base-type :type/BigInteger}]
                                                   [:field (meta/id :checkins :id)
                                                    {:base-type :type/BigInteger, :join-alias "CH"}]]}]
                    :filter       [:=
                                   [:field (meta/id :venues :price) {:base-type               :type/Integer
                                                                     :source-field            (meta/id :checkins :venue-id)
                                                                     :source-field-join-alias "CH"}]
                                   "1234"]}))]
      (is (=? {:query {:source-query {:source-table (meta/id :orders)
                                      :fields       [[:field (meta/id :orders :id)         {}]
                                                     [:field (meta/id :orders :user-id)    {}]
                                                     [:field (meta/id :orders :product-id) {}]
                                                     [:field (meta/id :orders :subtotal)   {}]
                                                     [:field (meta/id :orders :tax)        {}]
                                                     [:field (meta/id :orders :total)      {}]
                                                     [:field (meta/id :orders :discount)   {}]
                                                     [:field (meta/id :orders :created-at) {}]
                                                     [:field (meta/id :orders :quantity)   {}]]}
                       :joins        [{:source-query {:source-table (meta/id :checkins)}
                                       :alias        "CH"
                                       :strategy     :left-join
                                       :fields       [[:field (meta/id :checkins :id)       {:join-alias "CH"}]
                                                      [:field (meta/id :checkins :date)     {:join-alias "CH"}]
                                                      [:field (meta/id :checkins :user-id)  {:join-alias "CH"}]
                                                      [:field (meta/id :checkins :venue-id) {:join-alias "CH"}]]
                                       :condition    [:=
                                                      [:field "ID" {:base-type :type/BigInteger}]
                                                      [:field (meta/id :checkins :id)
                                                       {:base-type :type/BigInteger, :join-alias "CH"}]]}
                                      {:source-query        {:source-table (meta/id :venues)}
                                       :qp/is-implicit-join true
                                       :fk-join-alias       "CH"
                                       :alias               "VENUES__via__VENUE_ID__via__CH"
                                       :strategy            :left-join
                                       :fk-field-id         (meta/id :checkins :venue-id)
                                       :condition           [:=
                                                             [:field (meta/id :checkins :venue-id) {:join-alias "CH"}]
                                                             [:field (meta/id :venues :id) {:join-alias "VENUES__via__VENUE_ID__via__CH"}]]}]
                       :fields       [[:field "ID"         {:base-type :type/BigInteger}]
                                      [:field "USER_ID"    {:base-type :type/Integer}]
                                      [:field "PRODUCT_ID" {:base-type :type/Integer}]
                                      [:field "SUBTOTAL"   {:base-type :type/Float}]
                                      [:field "TAX"        {:base-type :type/Float}]
                                      [:field "TOTAL"      {:base-type :type/Float}]
                                      [:field "DISCOUNT"   {:base-type :type/Float}]
                                      [:field "CREATED_AT" {:base-type :type/DateTimeWithLocalTZ}]
                                      [:field "QUANTITY"   {:base-type :type/Integer}]
                                      ;; TODO (Cam 7/15/25) -- these should ACTUALLY be using field name refs rather
                                      ;; than ID refs as well
                                      [:field (meta/id :checkins :id)       {:join-alias "CH"}]
                                      [:field (meta/id :checkins :date)     {:join-alias "CH"}]
                                      [:field (meta/id :checkins :user-id)  {:join-alias "CH"}]
                                      [:field (meta/id :checkins :venue-id) {:join-alias "CH"}]]
                       :filter       [:=
                                      [:field
                                       (meta/id :venues :price)
                                       {:source-field-join-alias "CH"
                                        :join-alias              "VENUES__via__VENUE_ID__via__CH"}]
                                      [:value 1234 {}]]}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL))))))

(deftest ^:parallel returned-columns-no-duplicates-test
  (testing "Don't return columns from a join twice (QUE-1607)"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-query people
                   {:source-query {:source-table $$people
                                   :breakout     [!month.created-at]
                                   :aggregation  [[:count]]}
                    :joins        [{:source-query {:source-table $$people
                                                   :breakout     [!month.birth-date]
                                                   :aggregation  [[:count]]}
                                    :alias        "Q2"
                                    :condition    [:= !month.created-at !month.&Q2.birth-date]
                                    :fields       :all}]
                    :order-by     [[:asc !month.created-at]]
                    :limit        3}))]
      (is (=? {:query {:joins [{:fields [[:field (meta/id :people :birth-date) {:join-alias "Q2"}]
                                         [:field "count" {:base-type :type/Integer, :join-alias "Q2"}]]}]
                       :fields [[:field "CREATED_AT" {:inherited-temporal-unit :month}]
                                [:field "count" {:base-type :type/Integer}]
                                ;; TODO (Cam 9/11/25) -- this should use a name ref as well, once we convert the
                                ;; `resolve-joins` middleware this should be fixed
                                [:field (meta/id :people :birth-date) {:join-alias "Q2"}]
                                [:field "count" {:base-type :type/Integer, :join-alias "Q2"}]]}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL)))
      (is (= ["CREATED_AT"
              "count"
              "Q2__BIRTH_DATE"
              "Q2__count"]
             (mapv :lib/desired-column-alias (qp.preprocess/query->expected-cols query)))))))

(deftest ^:parallel unambiguous-field-refs-test
  (testing "QP metadata MUST return unambiguous field refs (if refs are ambiguous then force name refs) (QUE-1623)"
    (let [mp            (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                         meta/metadata-provider
                         [(lib.tu.macros/mbql-query orders
                            {:breakout    [$user-id]
                             :aggregation [[:count]]})
                          (lib.tu.macros/mbql-query orders
                            {:breakout    [$user-id]
                             :aggregation [[:count]]})
                          (lib.tu.macros/mbql-query people
                            {:fields [$id]
                             :joins  [{:fields       :all
                                       :alias        "ord1"
                                       :source-table "card__1"
                                       :condition    [:= $id &ord1.orders.user-id]}
                                      {:fields       :all
                                       :alias        "ord2"
                                       :source-table "card__2"
                                       :condition    [:= $id &ord2.orders.user-id]}]})])
          query         (lib/query mp {:database (meta/id)
                                       :type     :query
                                       :query    {:source-table "card__3"}})
          expected-cols (qp.preprocess/query->expected-cols query)]
      ;; use deduplicated column name for maximum backwards compatibility with legacy FE viz settings maps that use them
      ;; as keys.
      (is (apply distinct? (map :field_ref expected-cols)))
      (is (=? [{:lib/desired-column-alias "ID",            :field_ref [:field (meta/id :people :id) nil]}
               {:lib/desired-column-alias "ord1__USER_ID", :field_ref [:field "USER_ID" {}]}
               {:lib/desired-column-alias "ord1__count",   :field_ref [:field "count" {}]}
               {:lib/desired-column-alias "ord2__USER_ID", :field_ref [:field "USER_ID_2" {}]}
               {:lib/desired-column-alias "ord2__count",   :field_ref [:field "count_2" {}]}]
              (map #(select-keys % [:lib/desired-column-alias :field_ref])
                   expected-cols))))))

;;; adapted from [[metabase.query-processor.explicit-joins-test/test-31769]]
(deftest ^:parallel test-31769
  (testing "Make sure queries built with MLv2 that have source Cards with joins work correctly (#31769) (#33083)"
    (let [mp    (lib.tu.mocks-31769/mock-metadata-provider meta/metadata-provider meta/id)
          query (lib.tu.mocks-31769/query mp)]
      (is (=? {:stages [{:source-card 1}
                        {:joins [{:alias  "Card 2 - Products → Category"
                                  :fields :all
                                  :stages [{:source-card 2}]}]}]}
              query))
      (testing `lib/returned-columns
        (binding [lib.metadata.calculation/*display-name-style* :long]
          (is (= [["Products → Category"                     "Products__CATEGORY"]
                  ["Count"                                   "count"]
                  ["Card 2 - Products → Category → Category" "Card 2 - Products → Category__CATEGORY"]]
                 (mapv (juxt :display-name :lib/desired-column-alias)
                       (lib/returned-columns query))))))
      (testing `qp.preprocess/query->expected-cols
        (is (=? {:stages [{:breakout    [[:field {:join-alias "Products"} pos-int?]]
                           :aggregation [[:count {}]]
                           :joins       [{:alias  "Products"
                                          :stages [{:fields #(= (count %) 8)}]}
                                         {:alias  "People - User"
                                          :stages [{:fields #(= (count %) 13)}]}]}
                          {:fields [[:field {} "Products__CATEGORY"]
                                    [:field {} "count"]]}
                          {:fields [[:field {} "Products__CATEGORY"]
                                    [:field {} "count"]
                                    [:field {:join-alias "Card 2 - Products → Category"} (meta/id :products :category)]]
                           :joins  [{:alias  "Card 2 - Products → Category"
                                     :fields [[:field {:join-alias "Card 2 - Products → Category"} (meta/id :products :category)]]
                                     :stages [{:breakout [[:field {} (meta/id :products :category)]]}
                                              {:fields [[:field {} "CATEGORY"]]}]}]}]}
                (qp.preprocess/preprocess query)))
        (is (= [["Products → Category"                     "Products__CATEGORY"]
                ["Count"                                   "count"]
                ["Card 2 - Products → Category → Category" "Card 2 - Products → Category__CATEGORY"]]
               (map (juxt :display_name :lib/desired-column-alias)
                    (qp.preprocess/query->expected-cols query))))))))

(deftest ^:parallel sane-desired-column-aliases-test
  (testing "Do not 'double-dip' a desired-column alias and do `__via__` twice"
    (let [query (lib/query
                 meta/metadata-provider
                 {:type     :query
                  :database (meta/id)
                  :query    {:aggregation  [[:count]]
                             :source-table (meta/id :orders)
                             :breakout     [[:field
                                             (meta/id :products :category)
                                             {:source-field (meta/id :orders :product-id)}]]}})]
      (testing "one stage"
        (is (=? [{:name                         "CATEGORY"
                  :display_name                 "Product → Category"
                  ;; This should be `:source/implicitly-joinable` because we reify the join during preprocessing, and
                  ;; join doesn't exist in the original version of the query. Note that join alias doesn't come back in
                  ;; this case because [[metabase.lib.metadata.result-metadata/remove-implicit-join-aliases]] strips it
                  ;; out.
                  :lib/source                   :source/implicitly-joinable
                  :lib/breakout?                true
                  :lib/source-column-alias      "CATEGORY"
                  :lib/desired-column-alias     "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                  :metabase.lib.join/join-alias (symbol "nil #_\"key is not present.\"")
                  :lib/original-join-alias      (symbol "nil #_\"key is not present.\"")
                  :source_alias                 (symbol "nil #_\"key is not present.\"")
                  :fk_field_id                  (meta/id :orders :product-id)}
                 {:name                     "count"
                  :display_name             "Count"
                  :lib/source               :source/aggregations
                  :lib/source-column-alias  "count"
                  :lib/desired-column-alias "count"}]
                (qp.preprocess/query->expected-cols query))))
      ;; in the second stage keys like `:fk-field-id` need to get renamed to `:lib/original-fk-field-id`. and
      ;; desired-alias => new source-alias
      (testing "two stages"
        (let [query (lib/append-stage query)]
          (is (=? [{:name                     "CATEGORY"
                    :display_name             "Product → Category"
                    :lib/source-column-alias  "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                    :lib/desired-column-alias "PRODUCTS__via__PRODUCT_ID__CATEGORY"
                    :fk-field-id              (symbol "nil #_\"key is not present.\"")
                    :lib/original-fk-field-id (meta/id :orders :product-id)}
                   {:name                     "count"
                    :display_name             "Count"
                    :lib/source-column-alias  "count"
                    :lib/desired-column-alias "count"}]
                  (qp.preprocess/query->expected-cols query))))))))
