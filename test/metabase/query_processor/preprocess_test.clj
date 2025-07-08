(ns metabase.query-processor.preprocess-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.card :as lib.card]
   [metabase.lib.card-test]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
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
            (is (= expected-results
                   (qp.preprocess/preprocess query)))))))))

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
      (let [preprocessed (lib/query mp (qp.preprocess/preprocess query))
            stages       (:stages preprocessed)]
        (testing "added metadata"
          (testing "first stage (from Card 1)"
            (is (=? {:name                         "RATING"
                     :display-name                 "Product → Rating"
                     :metabase.lib.join/join-alias "Product"}
                    (m/find-first #(= (:name %) "RATING")
                                  (get-in (nth stages 0) [:lib/stage-metadata :columns])))))
          (testing "second stage (from Card 2)"
            (is (=? {:name                    "RATING"
                     :display-name            "Product → Rating"
                     :lib/original-join-alias "Product"}
                    (m/find-first #(= (:name %) "RATING")
                                  (get-in (nth stages 1) [:lib/stage-metadata :columns])))))))
      (is (=? [{:display_name "Product → Rating"}
               {:display_name "Sum of Total"}]
              (qp.preprocess/query->expected-cols query))))))

;;; adapted from [[metabase.queries.api.card-test/model-card-test-2]]
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
    (doseq [col (qp.preprocess/query->expected-cols query)]
      (testing (pr-str (:name col))
        (is (empty? (m/filter-vals #(= % "PRODUCTS__via__PRODUCT_ID") col)))))
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
      (is (=? {:query {:fields (lib.tu.macros/$ids orders
                                 [$id
                                  &People.people.longitude
                                  ;; the `:default` temporal unit gets removed somewhere
                                  &People.people.birth-date
                                  &Products.products.price])}}
              (qp.preprocess/preprocess query)))
      (is (= [;; orders.id, from :fields
              "ID"
              ;; from the People join :fields
              "People → Longitude"
              "People → Birth Date"
              ;; from the Products join :fields
              "Products → Price"]
             (map :display_name
                  (qp.preprocess/query->expected-cols query)))))))
