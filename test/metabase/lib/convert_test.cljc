(ns metabase.lib.convert-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel ->pMBQL-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1}
                      {:lib/type    :mbql.stage/mbql
                       :fields      [[:field {:lib/uuid string?} 2]
                                     [:field {:lib/uuid string?, :temporal-unit :month} 3]]
                       :aggregation [[:count {:lib/uuid string?}]]}]
           :database 1}
          (lib.convert/->pMBQL
           {:database 1
            :type     :query
            :query    {:source-query {:source-table 1}
                       :fields       [[:field 2 nil]
                                      [:field 3 {:temporal-unit :month}]]
                       :aggregation  [[:count]]}})))
  (testing ":field clause"
    (are [clause expected] (=? expected
                               (lib.convert/->pMBQL clause))
      [:field 2 nil]                     [:field {:lib/uuid string?} 2]
      [:field 3 {:temporal-unit :month}] [:field {:lib/uuid string?, :temporal-unit :month} 3])))

(deftest ^:parallel ->pMBQL-idempotency-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1}
                      {:lib/type    :mbql.stage/mbql
                       :fields      [[:field {:lib/uuid string?} 2]
                                     [:field {:lib/uuid string?, :temporal-unit :month} 3]]
                       :aggregation [[:count {:lib/uuid string?}]]}]
           :database 1}
          (lib.convert/->pMBQL
           (lib.convert/->pMBQL
            {:database 1
             :type     :query
             :query    {:source-query {:source-table 1}
                        :fields       [[:field 2 nil]
                                       [:field 3 {:temporal-unit :month}]]
                        :aggregation  [[:count]]}}))))
  (testing ":field clause"
    (are [clause expected] (=? expected
                               (lib.convert/->pMBQL (lib.convert/->pMBQL clause)))
      [:field 2 nil]                     [:field {:lib/uuid string?} 2]
      [:field 3 {:temporal-unit :month}] [:field {:lib/uuid string?, :temporal-unit :month} 3])))

(deftest ^:parallel ->pMBQL-joins-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type    :mbql.stage/mbql
                       :fields      [[:field
                                      {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                                      (meta/id :categories :name)]]
                       :joins       [{:lib/type    :mbql/join
                                      :lib/options {:lib/uuid string?}
                                      :alias       "CATEGORIES__via__CATEGORY_ID"
                                      :conditions  [[:=
                                                     {:lib/uuid string?}
                                                     [:field
                                                      {:lib/uuid string?}
                                                      (meta/id :venues :category-id)]
                                                     [:field
                                                      {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                                                      (meta/id :categories :id)]]]
                                      :strategy    :left-join
                                      :fk-field-id (meta/id :venues :category-id)
                                      :stages      [{:lib/type     :mbql.stage/mbql
                                                     :source-table (meta/id :venues)}]}]}]}
          (lib.convert/->pMBQL
           {:database (meta/id)
            :type     :query
            :query    {:source-table (meta/id :categories)
                       :fields [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                       :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                                 :source-table (meta/id :venues)
                                 :condition    [:=
                                                [:field (meta/id :venues :category-id) nil]
                                                [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                 :strategy     :left-join
                                 :fk-field-id  (meta/id :venues :category-id)}]}}))))

(deftest ^:parallel ->pMBQL-join-fields-test
  (testing "#29898"
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type     :mbql.stage/mbql
                         :joins        [{:alias       "Cat"
                                         :fields      [[:field {:lib/uuid string?, :join-alias "Cat"} 1]]
                                         :conditions  [[:=
                                                        {:lib/uuid string?}
                                                        [:field {:lib/uuid string?} 2]
                                                        [:field {:lib/uuid string?} 2]]]
                                         :lib/type    :mbql/join
                                         :stages      [{:lib/type     :mbql.stage/mbql
                                                        :source-table 3}]
                                         :lib/options {:lib/uuid string?}}]
                         :limit        1
                         :source-table 4}]
             :database 5}
            (lib.convert/->pMBQL
             {:database 5
              :type     :query
              :query    {:joins        [{:source-table 3
                                         :alias        "Cat"
                                         :condition    [:= [:field 2 nil] [:field 2 nil]]
                                         :fields       [[:field 1 {:join-alias "Cat"}]]}]
                         :limit        1
                         :source-table 4}})))))

(deftest ^:parallel aggregation-options-test
  (is (=? {:lib/type :mbql/query
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :aggregation  [[:sum
                                       {:lib/uuid string?, :display-name "Revenue"}
                                       [:field {:lib/uuid string?} 1]]]}]}
          (lib.convert/->pMBQL {:type  :query
                                :database 5
                                :query {:source-table 1
                                        :aggregation  [[:aggregation-options
                                                        [:sum [:field 1 nil]]
                                                        {:display-name "Revenue"}]]}}))))
(deftest ^:parallel effective-type-drop-test
  (testing ":effective_type values should be dropped in ->legacy-MBQL"
    (is (=? {:type  :query
             :query {:source-table 1
                     :aggregation  [[:sum [:field 1 nil]]]
                     :breakout     [[:aggregation 0 {:display-name "Revenue"}]]}}
            (let [ag-uuid (str (random-uuid))]
              (lib.convert/->legacy-MBQL
                {:lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :aggregation  [[:sum {:lib/uuid ag-uuid}
                                             [:field {:lib/uuid string?
                                                      :effective-type :type/Integer} 1]]]
                             :breakout     [[:aggregation
                                             {:display-name   "Revenue"
                                              :effective-type :type/Integer}
                                             ag-uuid]]}]}))))))

(deftest ^:parallel round-trip-test
  ;; Miscellaneous queries that have caused test failures in the past, captured here for quick feedback.
  (are [query] (= query (-> query lib.convert/->pMBQL lib.convert/->legacy-MBQL))
    ;; :aggregation-options on a non-aggregate expression with an inner aggregate.
    {:database 194
     :query {:aggregation [[:aggregation-options
                            [:- [:sum [:field 1677 nil]] 41]
                            {:name "Sum-41"}]]
             :breakout [[:field 1677 nil]]
             :source-table 517}
     :type :query}

    ;; :aggregation-options nested, not at the top level under :aggregation
    {:database 194
     :query {:aggregation [[:- [:aggregation-options
                                [:sum [:field 1677 nil]]
                                {:name "Sum-41"}] 41]]
             :breakout [[:field 1677 nil]]
             :source-table 517}
     :type :query}

    {:database 67
     :query {:aggregation [[:aggregation-options
                            [:avg
                             [:field
                              809
                              {:metabase.query-processor.util.add-alias-info/source-alias "RATING"
                               :metabase.query-processor.util.add-alias-info/source-table 224}]]
                            {:name "avg"
                             :metabase.query-processor.util.add-alias-info/desired-alias "avg"
                             :metabase.query-processor.util.add-alias-info/position 1
                             :metabase.query-processor.util.add-alias-info/source-alias "avg"}]]
             :source-table 224}
     :type :query}

    [:value nil {:base_type :type/Number}]

    [:expression "expr" {:display-name "Iambic Diameter"}]

    ;; (#29950)
    [:starts-with [:field 133751 nil] "CHE" {:case-sensitive true}]

    ;; (#29938)
    {"First int"  [:case [[[:= [:field 133751 nil] 1] 1]]    {:default 0}]
     "First bool" [:case [[[:= [:field 133751 nil] 1] true]] {:default false}]}

    [:case [[[:< [:field 1 nil] 10] [:value nil {:base_type :type/Number}]] [[:> [:field 2 nil] 2] 10]]]

    {:database 67
     :query {:filter [:= [:field
                          809
                          {:metabase.query-processor.util.add-alias-info/source-alias "RATING"
                           :metabase.query-processor.util.add-alias-info/source-table 224}] 1]
             :source-table 224}
     :type :query}

    {:database 67
     :query {:filter [:and
                      [:= [:field
                           809
                           {:metabase.query-processor.util.add-alias-info/source-alias "RATING"
                            :metabase.query-processor.util.add-alias-info/source-table 224}] 1]
                      [:= [:field
                           809
                           {:metabase.query-processor.util.add-alias-info/source-alias "RATING"
                            :metabase.query-processor.util.add-alias-info/source-table 224}] 1]]
             :source-table 224}
     :type :query}

    {:database 1,
     :type :query,
     :query
     {:source-table 2,
      :aggregation [[:count]],
      :breakout [[:field 14 {:temporal-unit :month}]],
      :order-by [[:asc [:aggregation 0]]]}}

    {:database 23001
     :type     :query
     :query    {:source-table 224
                :fields [[:field 23101 {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                :joins  [{:alias        "CATEGORIES__via__CATEGORY_ID"
                          :source-table 23040
                          :condition    [:=
                                         [:field 23402 nil]
                                         [:field 23100 {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                          :strategy     :left-join
                          :fk-field-id  23402}]}}

    {:database 1
     :type     :query
     :query    {:source-table 224
                :order-by [[:asc [:field 1 nil]]]}}

    {:database 5
     :type     :query
     :query    {:joins        [{:source-table 3
                                :alias        "Cat"
                                :condition    [:= [:field 2 nil] [:field 2 nil]]
                                :fields       [[:field 1 {:join-alias "Cat"}]]}]
                :limit        1
                :source-table 4}}

    {:database 310,
     :query {:middleware {:disable-remaps? true},
             :source-card-id 1301,
             :source-query {:native "SELECT id, name, category_id, latitude, longitude, price FROM venues ORDER BY id ASC LIMIT 2"}},
     :type :query}

    {:type :native,
     :native
     {:query
      "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" FROM \"PUBLIC\".\"VENUES\" LIMIT 1048575",
      :params nil}
     :database 2360}

    {:database 1,
     :native {:query "select 111 as my_number, 'foo' as my_string"},
     :parameters [{:target [:dimension [:field 16 {:source-field 5}]],
                   :type :category,
                   :value [:param-value]}],
     :type :native}))

(deftest ^:parallel round-trip-options-test
  (testing "Round-tripping (p)MBQL caluses with options (#30280)"
    (testing "starting with pMBQL"
      (is (=? [:does-not-contain {:lib/uuid string?
                                  :case-sensitive false}
               [:field {:lib/uuid string?} 23]
               "invite"]
              (-> [:does-not-contain {:lib/uuid "b6a2ab24-bfb2-4b90-bd71-f96b1e025a5e"
                                      :case-sensitive false}
                   [:field {:lib/uuid "5d01e669-783f-40e0-9ae0-2b8098448390"} 23]
                   "invite"]
                  lib.convert/->legacy-MBQL lib.convert/->pMBQL))))
    (testing "starting with MBQL"
      (let [mbql-filter [:does-not-contain [:field 23 nil] "invite" {:case-sensitive false}]]
        (is (= mbql-filter
               (-> mbql-filter lib.convert/->pMBQL lib.convert/->legacy-MBQL)))))))

(deftest ^:parallel case-expression-with-default-value-round-trip-test
  (testing "Round trip of case expression with default value (#30280)"
    (let [aggregation-options-clause
          [:aggregation-options
           [:distinct [:case [[[:> [:field 11 nil] 0] [:field 14 nil]]]
                       {:default [:field 13 nil]}]]
           {:name "CE"
            :display-name "CE"}]
          expected-pmbql-aggregation-options-clause
          [:distinct {:name "CE"
                      :display-name "CE"
                      :lib/uuid string?}
           [:case
            {:lib/uuid string?}
            [[[:> {:lib/uuid string?}
               [:field {:lib/uuid string?} 11] 0]
              [:field {:lib/uuid string?} 14]]]
            [:field {:lib/uuid string?} 13]]]
          mbql-query
          {:database 1
           :type :query
           :query {:expressions {"CC" [:+ 1 1]}
                   :limit 10
                   :source-query {:source-table 2
                                  :aggregation [aggregation-options-clause]
                                  :breakout [[:field 15 {:temporal-unit :month}]]}}
           :parameters []}
          pmbql-aggregation-options-clause
          (lib.convert/->pMBQL aggregation-options-clause)]
      (is (=? expected-pmbql-aggregation-options-clause
              pmbql-aggregation-options-clause))
      (is (=? aggregation-options-clause
              (lib.convert/->legacy-MBQL pmbql-aggregation-options-clause)))
      (is (= (dissoc mbql-query :parameters [])
             (-> mbql-query lib.convert/->pMBQL lib.convert/->legacy-MBQL))))))

(deftest ^:parallel round-trip-preserve-metadata-test
  (testing "Round-tripping should not affect embedded metadata"
    (let [query {:database 2445
                 :type     :query
                 :query    {:limit        5
                            :source-query {:source-table 1}
                            :source-metadata
                            [{:semantic_type   :type/PK
                              :table_id        32598
                              :name            "id"
                              :source          :fields
                              :field_ref       [:field 134528 nil]
                              :effective_type  :type/Integer
                              :id              134528
                              :visibility_type :normal
                              :display_name    "ID"
                              :base_type       :type/Integer}]}

                 :metabase-enterprise.sandbox.query-processor.middleware.row-level-restrictions/original-metadata
                 [{:base-type       :type/Text
                   :semantic-type   :type/Category
                   :table-id        32600
                   :name            "category"
                   :source          :breakout
                   :effective-type  :type/Text
                   :id              134551
                   :source-alias    "products__via__product_id"
                   :visibility-type :normal
                   :display-name    "Product → Category"
                   :field-ref       [:field 134551 {:source-field 134534}]
                   :fk-field-id     134534
                   :fingerprint     {:global {:distinct-count 4, :nil% 0.0}
                                     :type   {:type/text {:percent-json   0.0
                                                          :percent-url    0.0
                                                          :percent-email  0.0
                                                          :percent-state  0.0
                                                          :average-length 6.375}}}}]}]
      (is (= query
             (-> query lib.convert/->pMBQL lib.convert/->legacy-MBQL))))))

(deftest ^:parallel value-test
  (testing "For some crazy person reason legacy `:value` has `snake_case` options."
    (let [original [:value
                    3
                    {:base_type     :type/Integer
                     :semantic_type :type/Quantity
                     :database_type "INTEGER"
                     :name          "QUANTITY"
                     :unit          :quarter}]
          pMBQL    (lib.convert/->pMBQL original)]
      (testing "Normalize keys when converting to pMBQL. Add `:effective-type`."
        (is (=? [:value
                 {:lib/uuid       string?
                  :effective-type :type/Integer
                  :base-type      :type/Integer
                  :semantic-type  :type/Quantity
                  :database-type  "INTEGER"
                  :name           "QUANTITY"
                  :unit           :quarter}
                 3]
                pMBQL)))
      (testing "Round trip: make sure we convert back to `snake_case` when converting back."
        (is (= original
               (lib.convert/->legacy-MBQL pMBQL)))))))

(deftest ^:parallel clean-test
  (testing "irrecoverable queries"
    ;; Eventually we should get to a place where ->pMBQL throws an exception here,
    ;; but legacy e2e tests make this impossible right now
    (is (= {:type :query
            :query {}}
           (lib.convert/->legacy-MBQL
             (lib.convert/->pMBQL
               {:type :query}))))
    (is (= {:type :query
            :database 1
            :query {}}
            (lib.convert/->legacy-MBQL
              (lib.convert/->pMBQL
                {:type :query
                 :database 1}))))
    (is (= {:type :query
            :database 1
            :query {}}
           (lib.convert/->legacy-MBQL
             (lib.convert/->pMBQL
               {:type :query
                :database 1})))))
  (testing "recoverable queries"
    (is (nil? (->
                {:database 1
                 :type :query
                 :query {:source-table 224
                         :order-by [[:asc [:xfield 1 nil]]]}}
                lib.convert/->pMBQL
                lib/order-bys)))
    (is (nil? (->
                {:database 1
                 :type :query
                 :query {:source-table 224
                         :filter [:and [:= [:xfield 1 nil]]]}}
                lib.convert/->pMBQL
                lib/filters)))
    (is (nil? (->
                {:database 5
                 :type :query
                 :query {:joins [{:source-table 3
                                  ;; Invalid condition makes the join invalid
                                  :condition [:= [:field 2 nil] [:xfield 2 nil]]}]
                         :source-table 4}}
                 lib.convert/->pMBQL
                 lib/joins)))
    (is (nil? (->
                {:database 5
                 :type :query
                 :query {:joins [{:source-table 3
                                  :condition [:= [:field 2 nil] [:field 2 nil]]
                                  ;; Invalid field, the join is still valid
                                  :fields [[:xfield 2 nil]]}]
                         :source-table 4}}
                 lib.convert/->pMBQL
                 (get-in [:stages 0 :joins 0 :fields]))))))
