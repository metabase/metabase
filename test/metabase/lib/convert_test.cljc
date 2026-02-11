(ns metabase.lib.convert-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

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
                        :aggregation  [[:count]]}})))))

(deftest ^:parallel ->pMBQL-idempotency-test-2
  (testing ":field clause"
    (are [clause expected] (=? expected
                               (lib.convert/->pMBQL (lib.convert/->pMBQL clause)))
      [:field 2 nil]                     [:field {:lib/uuid string?} 2]
      [:field 3 {:temporal-unit :month}] [:field {:lib/uuid string?, :temporal-unit :month} 3])))

(deftest ^:parallel ->pMBQL-idempotency-test-3
  (testing "Calling ->pMBQL on something already MBQL 5 should no-op instead of adding duplicate options maps"
    (let [clause [[:=
                   {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                   [:field
                    {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                    (meta/id :users :id)]
                   [:field
                    {:base-type  :type/Integer
                     :join-alias "checkins_by_user"
                     :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                    "USER_ID"]]]]
      (is (= clause
             (lib.convert/->pMBQL clause))))))

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

(deftest ^:parallel ->pMBQL-native-query-test
  (testing "template tag dimensions are converted"
    (let [original {:type :native
                    :native
                    {:query "SELECT count(*) AS count FROM PUBLIC.PEOPLE WHERE true [[AND {{NAME}}]]"
                     :template-tags
                     {"NAME"
                      {:name "NAME"
                       :display-name "Name"
                       :type :dimension
                       :dimension [:field 866 nil]
                       :widget-type :string/=
                       :default nil}}}
                    :database 76}
          converted (lib.convert/->pMBQL original)]
      (is (=? {:stages [{:template-tags {"NAME" {:dimension [:field {:lib/uuid string?} 866]}}}]}
              converted))
      (is (mr/validate :metabase.lib.schema/query converted)))))

(deftest ^:parallel ->pMBQL-joins-default-alias-test
  (let [original {:database (meta/id)
                  :type     :query
                  :query    {:source-table (meta/id :categories)
                             :joins        [{:source-table (meta/id :venues)
                                             :condition    [:=
                                                            [:field (meta/id :venues :category-id) nil]
                                                            [:field (meta/id :categories :id) nil]]
                                             :strategy     :left-join}
                                            {:source-table (meta/id :checkins)
                                             :condition    [:=
                                                            [:field (meta/id :venues :id) nil]
                                                            [:field (meta/id :checkins :venue-id) nil]]
                                             :strategy     :left-join}]}}]
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :stages   [{:lib/type :mbql.stage/mbql
                         :joins    [{:lib/type    :mbql/join
                                     :lib/options {:lib/uuid string?}
                                     :alias       "__join"
                                     :conditions  [[:=
                                                    {:lib/uuid string?}
                                                    [:field
                                                     {:lib/uuid string?}
                                                     (meta/id :venues :category-id)]
                                                    [:field
                                                     {:lib/uuid string?}
                                                     (meta/id :categories :id)]]]
                                     :strategy    :left-join
                                     :stages      [{:lib/type     :mbql.stage/mbql
                                                    :source-table (meta/id :venues)}]}
                                    {:lib/type    :mbql/join
                                     :lib/options {:lib/uuid string?}
                                     :alias       "__join_2"
                                     :conditions  [[:=
                                                    {:lib/uuid string?}
                                                    [:field
                                                     {:lib/uuid string?}
                                                     (meta/id :venues :id)]
                                                    [:field
                                                     {:lib/uuid string?}
                                                     (meta/id :checkins :venue-id)]]]
                                     :strategy    :left-join
                                     :stages      [{:lib/type     :mbql.stage/mbql
                                                    :source-table (meta/id :checkins)}]}]}]}
            (lib.convert/->pMBQL original)))
    (is (= original
           (-> original lib.convert/->pMBQL lib.convert/->legacy-MBQL)))))

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
                                            [:field {:lib/uuid (str (random-uuid))
                                                     :effective-type :type/Integer} 1]]]
                            :breakout     [[:aggregation
                                            {:display-name   "Revenue"
                                             :effective-type :type/Integer}
                                            ag-uuid]]}]}))))))

(deftest ^:parallel multi-argument-string-comparison-test
  (doseq [tag [:contains :starts-with :ends-with :does-not-contain]]
    (testing (str tag)
      (testing "with two arguments (legacy style)"
        (testing "->pMBQL"
          (is (=? [tag {:lib/uuid string?} [:field {} 12] "ABC"]
                  (lib.convert/->pMBQL [tag [:field 12 nil] "ABC"])))
          (is (=? [tag {:lib/uuid string?, :case-sensitive false} [:field {} 12] "ABC"]
                  (lib.convert/->pMBQL [tag [:field 12 nil] "ABC" {:case-sensitive false}]))))
        (testing "->legacy-MBQL"
          (is (=? [tag [:field 12 nil] "ABC"]
                  (lib.convert/->legacy-MBQL [tag {} [:field {} 12] "ABC"])))
          (is (=? [tag [:field 12 nil] "ABC" {:case-sensitive false}]
                  (lib.convert/->legacy-MBQL
                   (lib.options/ensure-uuid [tag {:case-sensitive false} [:field {} 12] "ABC"]))))))

      (testing "with multiple arguments (pMBQL style)"
        (testing "->pMBQL"
          (is (=? [tag {:lib/uuid string?} [:field {} 12] "ABC" "HJK" "XYZ"]
                  (lib.convert/->pMBQL [tag {} [:field 12 nil] "ABC" "HJK" "XYZ"])))
          (is (=? [tag {:lib/uuid string?, :case-sensitive false}
                   [:field {} 12] "ABC" "HJK" "XYZ"]
                  (lib.convert/->pMBQL [tag {:case-sensitive false}
                                        [:field 12 nil] "ABC" "HJK" "XYZ"]))))

        (testing "->legacy-MBQL"
          (is (=? [tag {} [:field 12 nil] "ABC" "HJK" "XYZ"]
                  (lib.convert/->legacy-MBQL [tag {} [:field {} 12] "ABC" "HJK" "XYZ"])))
          (is (=? [tag {:case-sensitive false} [:field 12 nil] "ABC" "HJK" "XYZ"]
                  (lib.convert/->legacy-MBQL
                   (lib.options/ensure-uuid [tag {:case-sensitive false} [:field {} 12] "ABC" "HJK" "XYZ"])))))))))

(deftest ^:parallel source-card-test
  (let [original {:database 1
                  :type     :query
                  :query    {:source-table "card__100"}}]
    (is (=? {:lib/type :mbql/query
             :database 1
             :stages   [{:lib/type    :mbql.stage/mbql
                         :source-card 100}]}
            (lib.convert/->pMBQL original)))
    (is (= original
           (lib.convert/->legacy-MBQL (lib.convert/->pMBQL original))))))

(defn- test-round-trip [x]
  (testing (str "original =\n" (u/pprint-to-str x))
    (let [converted (lib.convert/->pMBQL x)]
      (testing (str "\nMBQL 5 =\n" (u/pprint-to-str converted))
        (is (= x
               (lib.convert/->legacy-MBQL converted)))))))

(deftest ^:parallel round-trip-test
  ;; Miscellaneous queries that have caused test failures in the past, captured here for quick feedback.
  (are [query] (test-round-trip query)
    [:value nil {:base_type :type/Number}]

    [:value "TX" nil]

    [:expression "expr" {:display-name "Iambic Diameter"}]

    ;; (#29950)
    [:starts-with [:field 133751 nil] "CHE" {:case-sensitive true}]

    ;; (#41958)
    [:starts-with      {}                      [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:ends-with        {}                      [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:contains         {}                      [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:does-not-contain {}                      [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:starts-with      {:case-sensitive false} [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:ends-with        {:case-sensitive false} [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:contains         {:case-sensitive false} [:field 133751 nil] "ABC" "HJK" "XYZ"]
    [:does-not-contain {:case-sensitive false} [:field 133751 nil] "ABC" "HJK" "XYZ"]

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

    {:database 310
     :query {:middleware {:disable-remaps? true}
             :source-card-id 1301
             :source-query {:native "SELECT id, name, category_id, latitude, longitude, price FROM venues ORDER BY id ASC LIMIT 2"}}
     :type :query}

    {:type :native
     :native
     {:query
      "SELECT \"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", \"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", \"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", \"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", \"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", \"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" FROM \"PUBLIC\".\"VENUES\" LIMIT 1048575"
      :params nil}
     :database 2360}

    {:database 1
     :native {:query "select 111 as my_number, 'foo' as my_string"}
     :parameters [{:target [:dimension [:field 16 {:source-field 5}]]
                   :type :category
                   :value [:param-value]}]
     :type :native}

    {:type :native
     :native
     {:query "SELECT count(*) AS count FROM PUBLIC.PEOPLE WHERE true [[AND {{NAME}}]]"
      :template-tags
      {"NAME"
       {:name "NAME"
        :display-name "Name"
        :type :dimension
        :dimension [:field 866 nil]
        :widget-type :string/=
        :default nil}}}
     :database 76}

    {:database 1
     :type     :query
     :query    {:source-table 224
                :expressions {"a" [:value 1 {:base_type :type/Integer}]}}}

    ;; card__<id> source table syntax.
    {:database 1
     :type     :query
     :query    {:source-table "card__1"}}

    ;; #32055
    {:type :query
     :database 5
     :query {:source-table 5822
             :expressions {"Additional Information Capture" [:coalesce
                                                             [:field 519195 nil]
                                                             [:field 519196 nil]
                                                             [:field 519194 nil]
                                                             [:field 519193 nil]
                                                             "None"]
                           "Additional Info Present" [:case
                                                      [[[:= [:expression "Additional Information Capture"] "None"]
                                                        "No"]]
                                                      {:default "Yes"}]}
             :filter [:= [:field 518086 nil] "active"]
             :aggregation [[:aggregation-options
                            [:share [:= [:expression "Additional Info Present"] "Yes"]]
                            {:name "Additional Information", :display-name "Additional Information"}]]}}))

(deftest ^:parallel round-trip-literal-expression-test
  ;; Some cases of literal expressions are already covered in round-trip-test, above.
  (are [x] (test-round-trip x)
    [:value false {:base_type :type/Boolean}]

    [:value true nil]

    [:value false nil]

    [:value "123" {:base_type :type/Text}]

    [:value "" nil]

    [:value "foo" nil]

    [:value 12345 {:base_type :type/Integer}]

    [:value -1 nil]

    [:value 0 nil]

    [:value 1 nil]

    [:value 1e10 {:base_type :type/Float}]

    [:value 1.23 nil]

    {:database 123
     :query {:middleware {:disable-remaps? true}
             :source-card-id 1301
             :source-query {:source-table 224
                            :expressions {"a" [:value 1 nil]
                                          "b" [:value false nil]}}
             :expressions {"c" [:value "cee" nil]
                           "d" [:value 1.23 nil]}}
     :type :query}

    {:database 1
     :type     :query
     :query    {:source-table 224
                :expressions {"a" [:value 1 nil]
                              "b" [:value 0 nil]
                              "c" [:value true nil]
                              "d" [:value false nil]
                              "e" [:value 2.71828 nil]
                              "f" [:value "foo" nil]
                              "g" [:value "" nil]}}}

    {:type :query
     :database 5
     :query {:source-table 5822
             :expressions {"literal expression" [:value false nil]
                           "coalesce"           [:coalesce
                                                 [:expression "literal expression"]
                                                 [:field 519196 nil]
                                                 "None"]
                           "case expression 1"  [:case
                                                 [[[:= [:expression "literal expression"] false]
                                                   "No"]]
                                                 {:default "Yes"}]
                           "case expression 2"  [:case
                                                 [[[:expression "literal expression"]
                                                   "No"]]
                                                 {:default "Yes"}]}
             :filter [:= [:field 518086 nil] [:expression "literal expression"]]
             :aggregation [[:aggregation-options
                            [:share [:= [:expression "literal expression"] true]]
                            {:name "Additional Information", :display-name "Additional Information"}]]}}))

(deftest ^:parallel round-trip-literal-expression-test-2
  (are [literal] (test-round-trip {:database 1
                                   :type     :query
                                   :query    {:source-table 224
                                              :expressions {"a" [:value literal nil]}}})
    true
    false
    0
    10
    -10
    10.15
    "abc"
    "2020-10-20"
    "2020-10-20T10:20:00"
    "2020-10-20T10:20:00Z"
    "10:20:00"))

(deftest ^:parallel round-trip-filter-expression-test
  (are [expressions filter-expression]
       (test-round-trip {:database 1
                         :type     :query
                         :query    (merge {:source-table 224
                                           :filter       filter-expression}
                                          (when (seq expressions)
                                            {:expressions expressions}))})
    {} [:value true nil]

    {} [:value false nil]

    {} [:value true {:base_type :type/Boolean}]

    {} [:value false {:base_type :type/Boolean}]

    {} [:field 1 {:base-type :type/Boolean}]

    {"true"  [:value true nil]}
    [:expression "true"]

    {"false" [:value false nil]}
    [:expression "false"]

    {"eq"  [:= 1 2]}
    [:expression "eq"]

    {"and"  [:and [:field 1 nil] [:field 2 nil]]}
    [:expression "and"]))

(deftest ^:parallel round-trip-segments-test
  (test-round-trip {:database 282
                    :type :query
                    :query {:source-table 661
                            :filter [:and
                                     [:segment 42]
                                     [:= [:field 1972 nil] "Run Query"]
                                     [:time-interval [:field 1974 nil] -30 :day]
                                     [:!= [:field 1973 nil] "(not set)" "url"]]
                            :breakout [[:field 1973 nil]]}}))

(deftest ^:parallel round-trip-aggregation-options-test
  (testing ":aggregation-options on a non-aggregate expression with an inner aggregate"
    (test-round-trip
     {:database 194
      :query {:aggregation [[:aggregation-options
                             [:- [:sum [:field 1677 nil]] 41]
                             {:name "Sum-41"}]]
              :breakout [[:field 1677 nil]]
              :source-table 517}
      :type :query}))
  (testing ":aggregation-options nested, not at the top level under :aggregation"
    (test-round-trip
     {:database 194
      :query {:aggregation [[:- [:aggregation-options
                                 [:sum [:field 1677 nil]]
                                 {:name "Sum-41"}] 41]]
              :breakout [[:field 1677 nil]]
              :source-table 517}
      :type :query}))

  (test-round-trip
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
    :type :query}))

(deftest ^:parallel round-trip-aggregation-references-test
  (test-round-trip
   {:database 1
    :type     :query
    :query    {:source-table 2
               :aggregation  [[:count]]
               :breakout     [[:field 14 {:temporal-unit :month}]]
               :order-by     [[:asc [:aggregation 0]]]}}))

(deftest ^:parallel round-trip-aggregation-with-case-test
  (test-round-trip
   {:database 2762
    :type     :query
    :query    {:aggregation  [[:sum [:case [[[:< [:field 139657 nil] 2] [:field 139657 nil]]] {:default 0}]]]
               :breakout     [[:field 139658 nil]]
               :limit        4
               :source-table 33674}}))

(deftest ^:parallel round-trip-aggregation-with-if-test
  (test-round-trip
   {:database 2762
    :type     :query
    :query    {:aggregation  [[:sum [:if [[[:< [:field 139657 nil] 2] [:field 139657 nil]]] {:default 0}]]]
               :breakout     [[:field 139658 nil]]
               :limit        4
               :source-table 33674}}))

(deftest ^:parallel round-trip-in-test
  (test-round-trip
   {:database 2762
    :type     :query
    :query    {:expressions  {"a" [:case [[[:in [:field 1 nil] 1 2], "A"]] {:default "B"}]}
               :filter       [:not-in [:field 2 nil] 3 4]
               :aggregation  [[:sum-where
                               [:field 3 nil]
                               [:in [:field 4 nil] 5 6]]]
               :limit        4
               :source-table 33674}}))

(deftest ^:parallel round-trip-aggregation-with-metric-test
  (test-round-trip
   {:database 1
    :query    {:aggregation  [[:+ [:metric 82] 1]]
               :source-table 1}
    :type     :query}))

;; TODO (Tamas 2026-01-05): Remove this test once FE tests switch to using MBQL5
(deftest ^:parallel round-trip-aggregation-with-measure-test
  (test-round-trip
   {:database 1
    :query    {:aggregation  [[:+ [:measure 82] 1]]
               :source-table 1}
    :type     :query}))

(deftest ^:parallel unclean-stage-round-trip-test
  (binding [lib.convert/*clean-query* false]
    (doseq [query
            [{:database 7
              :type :query
              :query {:joins [{:alias "__join"
                               :strategy :left-join
                               :condition [:= [:field 388 nil] 1]
                               :source-table 44}]
                      :source-table 43
                      :fields [[:field 390 nil]
                               [:field 391 nil]
                               [:field 388 nil]
                               [:field 392 nil]
                               [:field 393 nil]
                               [:field 389 nil]]}}
             {:database 7
              :qp/source-card-id 1
              :info {:card-id 1}
              :type :query
              :query {:limit 2
                      :fields [[:field 350 {:base-type :type/Text :join-alias "Card 2 - Category"}]
                               [:field "count" {:base-type :type/Integer}]
                               [:field 351 {:join-alias "Card 2 - Category"}]]
                      :joins [{:fields [[:field 350 {:join-alias "Card 2 - Category"}]]
                               :source-metadata [{:semantic_type :type/Category
                                                  :table_id 45
                                                  :name "CATEGORY"
                                                  :field_ref [:field 350 {:base-type :type/Text}]
                                                  :effective_type :type/Text
                                                  :id 350
                                                  :display_name "Category"
                                                  :fingerprint {:global {:distinct-count 4
                                                                         :nil% 0}
                                                                :type {:type/Text {:percent-json 0
                                                                                   :percent-url 0
                                                                                   :percent-email 0
                                                                                   :percent-state 0
                                                                                   :average-length 6.375}}}
                                                  :base_type :type/Text}]
                               :alias "Card 2 - Category"
                               :strategy :left-join
                               :source-query/model? false
                               :qp/stage-had-source-card 2
                               :condition [:=
                                           [:field "Products__CATEGORY" {:base-type :type/Text}]
                                           [:field 350 {:base-type :type/Text, :join-alias "Card 2 - Category"}]]
                               :source-query {:source-table 45
                                              :breakout [[:field 350 {:base-type :type/Text}]]
                                              :qp/stage-is-from-source-card 2
                                              :order-by [[:asc [:field 350 {:base-type :type/Text}]]]}}]
                      :source-query {:qp/stage-had-source-card 1
                                     :source-query/model? false
                                     :fields [[:field 350 {:base-type :type/Text, :join-alias "Products"}]
                                              [:field "count" {:base-type :type/Integer}]]
                                     :source-query {:source-table 42
                                                    :breakout [[:field 350 {:base-type :type/Text, :join-alias "Products"}]]
                                                    :aggregation [[:count]]
                                                    :qp/stage-is-from-source-card 1
                                                    :order-by [[:asc [:field 350 {:base-type :type/Text, :join-alias "Products"}]]]
                                                    :joins [{:alias "Products"
                                                             :strategy :left-join
                                                             :condition [:=
                                                                         [:field 382 {:base-type :type/Integer}]
                                                                         [:field 351 {:base-type :type/BigInteger
                                                                                      :join-alias "Products"}]]
                                                             :source-table 45}
                                                            {:alias "People - User"
                                                             :strategy :left-join
                                                             :condition [:=
                                                                         [:field 381 {:base-type :type/Integer}]
                                                                         [:field 370 {:base-type :type/BigInteger
                                                                                      :join-alias "People - User"}]]
                                                             :source-table 40}]}
                                     :source-metadata [{:semantic_type :type/Category
                                                        :table_id 45
                                                        :name "CATEGORY"
                                                        :field_ref [:field 350 {:base-type :type/Text, :join-alias "Products"}]
                                                        :effective_type :type/Text
                                                        :id 350
                                                        :display_name "Products → Category"
                                                        :fingerprint {:global {:distinct-count 4, :nil% 0}
                                                                      :type {:type/Text {:percent-json 0
                                                                                         :percent-url 0
                                                                                         :percent-email 0
                                                                                         :percent-state 0
                                                                                         :average-length 6.375}}}
                                                        :base_type :type/Text}
                                                       {:name "count"
                                                        :display_name "Count"
                                                        :base_type :type/Integer
                                                        :semantic_type :type/Quantity
                                                        :field_ref [:aggregation 0]}]}
                      :source-metadata [{:semantic_type :type/Category
                                         :table_id 45
                                         :name "CATEGORY"
                                         :field_ref [:field 350 {:base-type :type/Text
                                                                 :join-alias "Card 2 - Category"}]
                                         :effective_type :type/Text
                                         :id 350
                                         :display_name "Products → Category"
                                         :fingerprint {:global {:distinct-count 4, :nil% 0}
                                                       :type {:type/Text {:percent-json 0
                                                                          :percent-url 0
                                                                          :percent-email 0
                                                                          :percent-state 0
                                                                          :average-length 6.375}}}
                                         :base_type :type/Text}
                                        {:name "count"
                                         :display_name "Count"
                                         :base_type :type/Integer
                                         :semantic_type :type/Quantity
                                         :field_ref [:field "count" {:base-type :type/Integer}]}]}}]]
      (test-round-trip query))))

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
           :query {:expressions       {"CC" [:+ 1 1]}
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
      (is (= (dissoc mbql-query :parameters)
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

                 :metabase-enterprise.sandbox.query-processor.middleware.sandboxing/original-metadata
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
                                     :type   {:type/Text {:percent-json   0.0
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
               (lib.convert/->legacy-MBQL pMBQL))))))
  (testing "Type is filled in properly when missing"
    (is (=? [:value {:effective-type :type/Text} "TX"]
            (lib.convert/->pMBQL [:value "TX" nil])))))

(deftest ^:parallel clean-test
  ;; These nearly-empty queries should be handled correctly - iframe-based embedding yields queries like
  ;; `{:type :native}` and nothing more.
  (are [query] (= query (-> query lib.convert/->pMBQL lib.convert/->legacy-MBQL))
    {:type :query
     :database 1}
    {:type :query
     :database 1}
    {:type :query})

  (is (nil? (-> {:database 1
                 :type :query
                 :query {:source-table 224
                         :order-by [[:asc [:xfield 1 nil]]]}}
                lib.convert/->pMBQL
                lib/order-bys)))
  (is (nil? (-> {:database 1
                 :type :query
                 :query {:source-table 224
                         :filter [:and [:= [:xfield 1 nil]]]}}
                lib.convert/->pMBQL
                lib/filters)))
  (is (nil? (-> {:database 5
                 :type :query
                 :query {:joins [{:source-table 3
                                  ;; Invalid condition makes the join invalid
                                  :condition [:= [:field 2 nil] [:xfield 2 nil]]}]
                         :source-table 4}}
                lib.convert/->pMBQL
                lib/joins)))
  (is (nil? (-> {:database 5
                 :type :query
                 :query {:joins [{:source-table 3
                                  :condition [:= [:field 2 nil] [:field 2 nil]]
                                  ;; Invalid field, the join is still valid
                                  :fields [[:xfield 2 nil]]}]
                         :source-table 4}}
                lib.convert/->pMBQL
                (get-in [:stages 0 :joins 0 :fields]))))
  (testing "references to missing expressions are removed (#32625)"
    (let [query {:database 2762
                 :type     :query
                 :query    {:aggregation [[:sum [:case [[[:< [:field 139657 nil] 2] [:field 139657 nil]]] {:default 0}]]]
                            :expressions {"custom" [:+ 1 1]}
                            :breakout    [[:expression "expr1" nil] [:expression "expr2" nil]]
                            :order-by    [[:expression "expr2" nil]]
                            :limit       4
                            :source-table 33674}}
          converted (lib.convert/->pMBQL query)]
      (is (empty? (get-in converted [:stages 0 :breakout])))
      (is (empty? (get-in converted [:stages 0 :group-by]))))))

(deftest ^:parallel remove-namespaced-lib-keys-from-legacy-refs-test
  (testing "namespaced lib keys should be removed when converting to legacy (#33012)"
    (testing `lib.convert/disqualify
      (is (= {:join-alias    "O"
              :temporal-unit :year}
             (#'lib.convert/disqualify
              {:join-alias                                 "O"
               :temporal-unit                              :year
               :metabase.lib.field/original-effective-type :type/DateTimeWithLocalTZ}))))
    (testing `lib.convert/->legacy-MBQL
      (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                      (lib/join (-> (lib/join-clause (meta/table-metadata :orders))
                                    (lib/with-join-alias "O")
                                    (lib/with-join-conditions [(lib/=
                                                                (-> (meta/field-metadata :products :created-at)
                                                                    lib/ref
                                                                    (lib/with-temporal-bucket :year))
                                                                (-> (meta/field-metadata :orders :created-at)
                                                                    (lib/with-join-alias "O")
                                                                    lib/ref
                                                                    (lib/with-temporal-bucket :year)))]))))]
        (testing "sanity check: the pMBQL query should namespaced have keys (:metabase.lib.field/original-effective-type)"
          (is (=? {:stages [{:joins [{:alias      "O"
                                      :conditions [[:=
                                                    {}
                                                    [:field
                                                     {:temporal-unit                              :year
                                                      :metabase.lib.field/original-effective-type :type/DateTimeWithLocalTZ}
                                                     (meta/id :products :created-at)]
                                                    [:field
                                                     {:join-alias                                 "O"
                                                      :temporal-unit                              :year
                                                      :metabase.lib.field/original-effective-type :type/DateTimeWithLocalTZ}
                                                     (meta/id :orders :created-at)]]]}]}]}
                  query)))
        (is (=? {:query {:joins [{:alias        "O"
                                  :condition    [:=
                                                 [:field
                                                  (meta/id :products :created-at)
                                                  {:base-type                                  :type/DateTimeWithLocalTZ
                                                   :temporal-unit                              :year
                                                   :metabase.lib.field/original-effective-type (symbol "nil #_\"key is not present.\"")}]
                                                 [:field
                                                  (meta/id :orders :created-at)
                                                  {:base-type                                  :type/DateTimeWithLocalTZ
                                                   :join-alias                                 "O"
                                                   :temporal-unit                              :year
                                                   :metabase.lib.field/original-effective-type (symbol "nil #_\"key is not present.\"")}]]}]}}
                (lib.convert/->legacy-MBQL query)))))))

(deftest ^:parallel legacy-ref->pMBQL-field-test
  (are [legacy-ref] (=? [:field {:lib/uuid string?} (meta/id :venues :name)]
                        (lib.convert/legacy-ref->pMBQL (lib.tu/venues-query) legacy-ref))
    [:field (meta/id :venues :name) nil]
    [:field (meta/id :venues :name) {}]
    ;; should work with refs that need normalization
    ["field" (meta/id :venues :name) nil]
    ["field" (meta/id :venues :name)]
    #?@(:cljs
        [#js ["field" (meta/id :venues :name) nil]
         #js ["field" (meta/id :venues :name) #js {}]]))
  #?(:cljs
     (is (=? [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :name)]
             (lib.convert/legacy-ref->pMBQL
              (lib.tu/venues-query)
              #js ["field" (meta/id :venues :name) #js {"base-type" "type/Integer"}])))))

(deftest ^:parallel legacy-ref->pMBQL-expression-test
  (are [legacy-ref] (=? [:expression {:lib/uuid string?} "expr"]
                        (lib.convert/legacy-ref->pMBQL (lib.tu/query-with-expression) legacy-ref))
    [:expression "expr"]
    ["expression" "expr"]
    ["expression" "expr" nil]
    ["expression" "expr" {}]
    #?@(:cljs
        [#js ["expression" "expr"]
         #js ["expression" "expr" #js {}]])))

(deftest ^:parallel legacy-ref->pMBQL-aggregation-test
  (let [query (-> (lib.tu/venues-query)
                  (lib/aggregate (lib/count)))
        [ag]  (lib/aggregations query)]
    (are [legacy-ref] (=? [:aggregation {:lib/uuid string?} (lib.options/uuid ag)]
                          (lib.convert/legacy-ref->pMBQL query legacy-ref))
      [:aggregation 0]
      ["aggregation" 0]
      ["aggregation" 0 nil]
      ["aggregation" 0 {}]
      #?@(:cljs
          [#js ["aggregation" 0]
           #js ["aggregation" 0 #js {}]]))))

(deftest ^:parallel convert-aggregation-reference-test
  (testing "Don't wrap :aggregation in :aggregation options when converting between legacy and pMBQL"
    (let [query {:database 2
                 :type     :query
                 :query    {:aggregation  [[:aggregation-options
                                            [:sum [:field 100 {:source-table 12, :source-alias "TOTAL"}]]
                                            {:name "sum"}]]
                            :order-by     [[:asc [:aggregation 0 {:desired-alias "sum", :position 1}]]
                                           [:asc
                                            [:field 99 {:source-table  12
                                                        :source-alias  "PRODUCT_ID"
                                                        :desired-alias "PRODUCT_ID"
                                                        :position      0}]]]
                            :source-table 12}}]
      (is (= query
             (-> query lib.convert/->pMBQL lib.convert/->legacy-MBQL))))))

(deftest ^:parallel parameters-dimension-clause-test
  (testing "Don't convert :template-tag clauses... YET"
    (let [pmbql (lib.convert/->pMBQL {:database 1
                                      :type     :native
                                      :native   {:parameters [{:target [:dimension [:template-tag "x"]]}]}})]
      (is (=? {:stages [{:parameters [{:target [:dimension [:template-tag "x"]]}]}]}
              pmbql))
      (is (=? {:native {:parameters [{:target [:dimension [:template-tag "x"]]}]}}
              (lib.convert/->legacy-MBQL pmbql))))))

(deftest ^:parallel parameters-field-target-test
  (testing "Don't convert :field clauses inside :parameters... YET"
    (let [pmbql (lib.convert/->pMBQL {:database 1
                                      :type     :native
                                      :native   {:parameters [{:target [:field 1 nil]}]}})]
      (is (=? {:stages [{:parameters [{:target [:field 1 nil]}]}]}
              pmbql))
      (is (=? {:native {:parameters [{:target [:field 1 nil]}]}}
              (lib.convert/->legacy-MBQL pmbql))))))

(deftest ^:parallel time-interval-nil-options-test
  (testing "We should convert :time-interval clauses with nil options correctly"
    (are [x] (=? [:time-interval
                  {:lib/uuid string?}
                  [:field {:lib/uuid string?} 1]
                  -5
                  :year]
                 (lib/->pMBQL x))
      [:time-interval [:field 1 nil] -5 :year nil]
      [:time-interval [:field 1 nil] -5 :year {}])))

(deftest ^:parallel convert-arithmetic-expressions-to-legacy-test
  (testing "Generate correct expression definitions even if expression contains `:name` (#40982)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                    (lib/breakout (meta/field-metadata :orders :created-at))
                    (lib/expression "expr" (lib.options/update-options (lib/+ 1 2) assoc :name "my_expr", :base-type :type/Number)))]
      (is (=? {:type  :query
               :query {:expressions {"expr" [:+ 1 2]}}}
              (lib.convert/->legacy-MBQL query))))))

(deftest ^:parallel convert-with-broken-expression-types-test
  (testing "be flexible when converting from legacy, metadata type overrides are sometimes dropped (#41122)"
    (let [legacy {:database (meta/id)
                  :type     :query
                  :query    {:filter [:between [:+
                                                [:field 40 {:base-type :type/Integer}]
                                                [:interval 1 :year]]
                                      [:relative-datetime -2 :month]
                                      [:relative-datetime 0 :month]]}}]
      (is (=? {:stages [{:filters [[:between {} [:+ {}
                                                 [:field {:base-type :type/Integer} 40]
                                                 [:interval {} 1 :year]]
                                    [:relative-datetime {} -2 :month]
                                    [:relative-datetime {} 0 :month]]]}]}
              (lib.convert/->pMBQL legacy))))))

(deftest ^:parallel offset-test
  (testing "Preserve complete options map when converting :offset to legacy, do not wrap in aggregation-options"
    (are [options-map] (=? {:aggregation [[:offset options-map
                                           [:sum
                                            [:field 16890 {:base-type :type/Float}]]
                                           -1]]}
                           (lib.convert/->legacy-MBQL
                            {:lib/type :mbql.stage/mbql
                             :aggregation [[:offset options-map
                                            [:sum
                                             {:lib/uuid "c88914b9-56d3-48c4-bfaf-1600dd973076"}
                                             [:field
                                              {:lib/uuid "aabe0b60-6b0e-44d9-92e1-dce499b7e9ce"
                                               :base-type :type/Float}
                                              16890]]
                                            -1]]}))
      {:lib/uuid "d5149080-5e1c-4643-9264-bf4a82116abd"}
      {:lib/uuid "d5149080-5e1c-4643-9264-bf4a82116abd", :name "my_offset"})))

(deftest ^:parallel cumulative-count-test
  (is (=? (lib.tu.macros/mbql-query
            venues
            {:source-table $$venues
             :aggregation [[:aggregation-options
                            [:cum-count [:field %id {:base-type :type/BigInteger}]]
                            {:name "count"}]]})
          (lib.convert/->legacy-MBQL
           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
               (lib/aggregate (lib.options/update-options
                               (lib/cum-count (meta/field-metadata :venues :id))
                               assoc :name "count")))))))

(deftest ^:parallel cumulative-aggregations-in-expression-test
  (is (=?  (lib.tu.macros/mbql-query
             venues
             {:source-table $$venues
              :aggregation [[:aggregation-options
                             [:+
                              [:aggregation-options [:cum-sum [:field %id {:base-type :type/BigInteger}]] {:name "a"}]
                              [:aggregation-options [:cum-count] {:name "b"}]]
                             {:name "xixix"}]]})
           (lib.convert/->legacy-MBQL
            (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                (lib/aggregate (lib.options/update-options
                                (lib/+ (lib.options/update-options
                                        (lib/cum-sum (meta/field-metadata :venues :id))
                                        assoc :name "a")
                                       (lib.options/update-options
                                        (lib/cum-count)
                                        assoc :name "b"))
                                assoc :name "xixix")))))))

(deftest ^:parallel round-trip-expression-literal-test
  (are [literal] (test-round-trip {:database 1
                                   :type     :query
                                   :query    {:source-table 224
                                              :expressions {"a" [:value literal nil]}}})
    true
    false
    0
    10
    -10
    10.15
    "abc"
    "2020-10-20"
    "2020-10-20T10:20:00"
    "2020-10-20T10:20:00Z"
    "10:20:00"))

(deftest ^:parallel round-trip-joins-metadata-test
  (testing "when converting a join, preserve metadata correctly"
    (let [legacy {:database (meta/id)
                  :type     :query
                  :query    {:source-table (meta/id :categories)
                             :fields       [[:field (meta/id :categories :name) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                             :joins        [{:alias           "CATEGORIES__via__CATEGORY_ID"
                                             :source-table    (meta/id :venues)
                                             :condition       [:=
                                                               [:field (meta/id :venues :category-id) nil]
                                                               [:field (meta/id :categories :id) {:join-alias "CATEGORIES__via__CATEGORY_ID"}]]
                                             :strategy        :left-join
                                             :fk-field-id     (meta/id :venues :category-id)
                                             :source-metadata [{:name "ID", :display_name "ID", :base_type :type/Integer}]}]}}]
      (testing "legacy => MBQL 5"
        (is (=? {:stages [{:joins [{:lib/type           :mbql/join
                                    :stages             [{:lib/stage-metadata {:lib/type :metadata/results
                                                                               :columns  [{:lib/type     :metadata/column
                                                                                           :name         "ID"
                                                                                           :display-name "ID"}]}}]
                                    :lib/stage-metadata (symbol "nil #_\"key is not present.\"")
                                    :source-metadata    (symbol "nil #_\"key is not present.\"")}]}]}
                (-> legacy lib.convert/->pMBQL))))
      (testing "legacy => MBQL 5 => legacy"
        (is (=? {:query {:joins [{:alias           "CATEGORIES__via__CATEGORY_ID"
                                  :source-metadata [{:lib/type     (symbol "nil #_\"key is not present.\"")
                                                     :name         "ID"
                                                     :display_name "ID"
                                                     :base_type    :type/Integer}]}]}}
                (-> legacy lib.convert/->pMBQL lib.convert/->legacy-MBQL))))
      (testing "legacy => MBQL 5 => legacy => MBQL 5"
        (is (=? {:stages [{:joins [{:lib/type           :mbql/join
                                    :stages             [{:lib/stage-metadata {:lib/type :metadata/results
                                                                               :columns  [{:lib/type     :metadata/column
                                                                                           :name         "ID"
                                                                                           :display-name "ID"}]}}]
                                    :lib/stage-metadata (symbol "nil #_\"key is not present.\"")
                                    :source-metadata    (symbol "nil #_\"key is not present.\"")}]}]}
                (-> legacy lib.convert/->pMBQL lib.convert/->legacy-MBQL lib.convert/->pMBQL)))))))

(deftest ^:parallel ->pMBQL-datetime-test
  (is (=? [:datetime {:mode :unix-seconds
                      :lib/uuid string?} 10]
          (lib.convert/->pMBQL [:datetime 10 {:mode :unix-seconds}])))
  (is (=? [:datetime {:mode :iso
                      :lib/uuid string?} ""]
          (lib.convert/->pMBQL [:datetime "" {:mode :iso}])))
  (is (=? [:datetime {:lib/uuid string?} ""]
          (lib.convert/->pMBQL [:datetime "" {}])))
  (is (=? [:datetime {:lib/uuid string?} ""]
          (lib.convert/->pMBQL [:datetime ""]))))

(deftest ^:parallel ->pMBQL-relative-datetime-test
  (testing "Convert legacy relative-datetime with string unit to pMBQL with keyword unit"
    (is (=? [:relative-datetime {:lib/uuid string?} -1 :quarter]
            (lib.convert/->pMBQL [:relative-datetime -1 "quarter"])))
    (is (=? [:relative-datetime {:lib/uuid string?} -1 :month]
            (lib.convert/->pMBQL [:relative-datetime -1 "month"])))
    (is (=? [:relative-datetime {:lib/uuid string?} 0 :day]
            (lib.convert/->pMBQL [:relative-datetime 0 "day"]))))
  (testing "Convert legacy relative-datetime with keyword unit to pMBQL"
    (is (=? [:relative-datetime {:lib/uuid string?} -1 :quarter]
            (lib.convert/->pMBQL [:relative-datetime -1 :quarter]))))
  (testing "Convert legacy relative-datetime without unit to pMBQL"
    (is (=? [:relative-datetime {:lib/uuid string?} -1]
            (lib.convert/->pMBQL [:relative-datetime -1]))))
  (testing "Convert legacy relative-datetime with :current amount"
    (is (=? [:relative-datetime {:lib/uuid string?} :current :month]
            (lib.convert/->pMBQL [:relative-datetime :current "month"])))
    (is (=? [:relative-datetime {:lib/uuid string?} :current]
            (lib.convert/->pMBQL [:relative-datetime :current])))))

(deftest ^:parallel ->legacy-MBQL-test
  (is (= [:datetime 10 {:mode :unix-seconds}]
         (lib.convert/->legacy-MBQL [:datetime {:mode :unix-seconds, :lib/uuid "5016882d-8dbf-4271-ab60-4dc96a595ca9"} 10])))
  (is (= [:datetime ""]
         (lib.convert/->legacy-MBQL [:datetime {:lib/uuid "5016882d-8dbf-4271-ab60-4dc96a595ca9"} ""])))
  (is (= [:datetime "" {:mode :iso}]
         (lib.convert/->legacy-MBQL [:datetime {:lib/uuid "5016882d-8dbf-4271-ab60-4dc96a595ca9" :mode :iso} ""]))))

(deftest ^:parallel round-trip-aggregation-reference-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                  (lib/aggregate (lib/sum (meta/field-metadata :orders :total))))
        sum   (->> (lib/aggregable-columns query nil)
                   (m/find-first (comp #{"sum"} :name)))
        query (lib/aggregate query (lib/with-expression-name (lib/* 2 sum) "2*sum"))
        legacy-query (lib.convert/->legacy-MBQL query)]
    (is (= legacy-query
           (-> legacy-query lib.convert/->pMBQL lib.convert/->legacy-MBQL)))))

(deftest ^:parallel join-native-source-query->legacy-test
  (testing "join :source-query should rename :query to :native for native stages"
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type :mbql.stage/mbql
                             :joins    [{:lib/type   :mbql/join
                                         :alias      "c"
                                         :conditions [[:=
                                                       {:lib/uuid "43813e7b-ebf7-4278-8ab4-af23be9ffc0d"}
                                                       [:field
                                                        {:lib/uuid "b8ad483b-1ff8-4979-bb3e-c006fe5caf46"}
                                                        61325]
                                                       [:field
                                                        {:base-type :type/BigInteger, :join-alias "c", :lib/uuid "3000ef3f-a190-4f47-88df-404150748352"}
                                                        "ID"]]]
                                         :stages     [{:lib/type :mbql.stage/native
                                                       :query    "SELECT * FROM categories WHERE name = ?;"
                                                       :params   ["BBQ"]}
                                                      {:lib/type :mbql.stage/mbql}]}]}]}]
      (is (=? {:type  :query
               :query {:joins [{:alias        "c"
                                :condition    [:= [:field 61325 nil] [:field "ID" {:base-type :type/BigInteger, :join-alias "c"}]]
                                :source-query {:native "SELECT * FROM categories WHERE name = ?;"
                                               :params ["BBQ"]}}]}}
              (lib.convert/->legacy-MBQL query))))))

(deftest ^:parallel do-not-do-nasty-stuff-to-parameters-test
  (let [query {:database 33001
               :type     :query
               :query    {:source-query {:source-table 33030
                                         :expressions  {"date-column"   [:field 33302 nil]
                                                        "number-column" [:field 33300 nil]}
                                         :parameters   [{:type   :date/range
                                                         :value  "2019-09-29~2023-09-29"
                                                         :target [:dimension [:expression "date-column"]]}
                                                        {:type   :category
                                                         :value  1
                                                         :target [:dimension [:expression "number-column"]]}]}}}]
    (is (=? {:lib/type :mbql/query
             :stages   [{:lib/type    :mbql.stage/mbql
                         :expressions [[:field
                                        {:lib/uuid            string?
                                         :lib/expression-name "date-column"}
                                        pos-int?]
                                       [:field
                                        {:lib/uuid            string?
                                         :lib/expression-name "number-column"}
                                        pos-int?]]
                         :parameters  [{:type :date/range, :value "2019-09-29~2023-09-29", :target [:dimension [:expression "date-column"]]}
                                       {:type :category, :value 1, :target [:dimension [:expression "number-column"]]}]}
                        {:lib/type :mbql.stage/mbql}]}
            (lib/->pMBQL query)))
    (is (=? query
            (-> query lib/->pMBQL lib/->legacy-MBQL)))))

;;; TODO (Cam 8/8/25) -- mentioned in `->pMBQL` for `:mbql/join` but we don't even actually ever attach `:parameters`
;;; to a join's top-level IRL, so this not something we ACTUALLY need to support.
(deftest ^:parallel join-parameters-test
  (let [query {:database 33001
               :type     :query
               :query    {:source-query {:source-table 33040}
                          :aggregation  [[:count]]
                          :joins        [{:source-table 33010
                                          :alias        "c"
                                          :condition    [:=
                                                         [:field 33402 nil]
                                                         [:field 33100 {:join-alias "c"}]]
                                          :parameters   [{:type   :category
                                                          :target [:field 33101 nil]
                                                          :value  "BBQ"}]}]}}]
    (is (=? {:stages   [{:source-table 33040}
                        {:joins [{:alias      "c"
                                  :parameters (symbol "nil #_\"key is not present.\"")
                                  :conditions [[:=
                                                {}
                                                [:field {} 33402]
                                                [:field {:join-alias "c"} 33100]]]
                                  :lib/type   :mbql/join
                                  :stages     [{:lib/type     :mbql.stage/mbql
                                                :source-table 33010
                                                :parameters   [{:type   :category
                                                                :target [:field 33101 nil]
                                                                :value  "BBQ"}]}]}]}]
             :database 33001}
            (lib/->pMBQL query)))
    (testing "round-trip to legacy should leave join parameters in the :source-query"
      (is (=? {:database 33001
               :type     :query
               :query    {:source-query {:source-table 33040}
                          :aggregation  [[:count]]
                          :joins        [{:source-query {:source-table 33010
                                                         :parameters   [{:type   :category
                                                                         :target [:field 33101 nil]
                                                                         :value  "BBQ"}]}
                                          :alias        "c"
                                          :condition    [:=
                                                         [:field 33402 nil]
                                                         [:field 33100 {:join-alias "c"}]]}]}}
              (-> query lib/->pMBQL lib/->legacy-MBQL))))))

(deftest ^:parallel join-parameters-test-2
  (testing "If join has top-level :parameters and its source query has :parameters, splice them together"
    (let [query {:database 33001
                 :type     :query
                 :query    {:aggregation  [[:count]]
                            :joins        [{:source-query {:source-table 33010
                                                           :parameters   [{:name "id", :type :category, :target [:field 33100 nil], :value 5}]}
                                            :alias        "c"
                                            :condition    [:= [:field 33402 nil] [:field 33100 {:join-alias "c"}]]
                                            :parameters   [{:type "category", :target [:field 33101 nil], :value "BBQ"}]}]
                            :source-table 33040}}]
      (is (=? {:stages [{:joins [{:alias      "c"
                                  :stages     [{:parameters [{:name "id", :type :category, :target [:field 33100 nil], :value 5}
                                                             {:type :category, :target [:field 33101 nil], :value "BBQ"}]}]
                                  :parameters (symbol "nil #_\"key is not present.\"")}]}]}
              (lib/->pMBQL query))))))

(deftest ^:parallel convert-join-with-filters-test
  (testing "A join whose sole stage has :filters should get converted to a join with a :source-query (QUE-1566)"
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :joins        [{:alias      "c"
                                             :conditions [[:=
                                                           {:lib/uuid "4822482b-727b-471b-8d18-973d87861522"}
                                                           [:field
                                                            {:lib/uuid  "c68f5bbf-a45a-4a28-b235-a60dcb2d73be"
                                                             :base-type :type/Integer}
                                                            33402]
                                                           [:field
                                                            {:join-alias "c"
                                                             :lib/uuid   "d0f55447-6941-4c7a-a192-a37d87ea0111"
                                                             :base-type  :type/BigInteger}
                                                            33100]]]
                                             :lib/type   :mbql/join
                                             :stages     [{:lib/type     :mbql.stage/mbql
                                                           :source-table 33010
                                                           :filters      [[:=
                                                                           {:lib/uuid "cba9a408-5f66-4ae2-83a9-bdaca23ef878"}
                                                                           [:field {:lib/uuid "7d4cb0c9-f7ec-4712-8fe7-4d06e9a3944a"} 33101]
                                                                           "BBQ"]]}]}]
                             :source-table 33040}]
                 :database 33001}]
      (is (=? {:database 33001
               :type     :query
               :query    {:joins        [{:alias        "c"
                                          :condition    [:=
                                                         [:field 33402 {:base-type :type/Integer}]
                                                         [:field 33100 {:join-alias "c", :base-type :type/BigInteger}]]
                                          :source-query {:source-table 33010
                                                         :filter       [:= [:field 33101 nil] "BBQ"]}
                                          :source-table (symbol "nil #_\"key is not present.\"")
                                          :filter       (symbol "nil #_\"key is not present.\"")}]
                          :source-table 33040}}
              (lib/->legacy-MBQL query))))))

(deftest ^:parallel convert-join-with-fields-test
  (let [query {:lib/type :mbql/query
               :stages   [{:lib/type     :mbql.stage/mbql
                           :joins        [{:alias      "c"
                                           :conditions [[:=
                                                         {:lib/uuid "4822482b-727b-471b-8d18-973d87861522"}
                                                         [:field
                                                          {:lib/uuid  "c68f5bbf-a45a-4a28-b235-a60dcb2d73be"
                                                           :base-type :type/Integer}
                                                          33402]
                                                         [:field
                                                          {:join-alias "c"
                                                           :lib/uuid   "d0f55447-6941-4c7a-a192-a37d87ea0111"
                                                           :base-type  :type/BigInteger}
                                                          33100]]]
                                           :lib/type   :mbql/join
                                           :stages     [{:lib/type     :mbql.stage/mbql
                                                         :source-table 33010
                                                         :fields       [[:field {:lib/uuid "7d4cb0c9-f7ec-4712-8fe7-4d06e9a3944a"} 33101]]}]}]
                           :source-table 33040}]
               :database 33001}]
    (is (=? {:database 33001
             :type     :query
             :query    {:joins        [{:alias        "c"
                                        :condition    [:=
                                                       [:field 33402 {:base-type :type/Integer}]
                                                       [:field 33100 {:join-alias "c", :base-type :type/BigInteger}]]
                                        :source-query {:source-table 33010
                                                       :fields       [[:field 33101 nil]]}}]
                        :source-table 33040}}
            (lib/->legacy-MBQL query)))))

(deftest ^:parallel join-native-source-query->legacy-test-2
  (testing "join :source-query should rename :query to :native for native stages"
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type :mbql.stage/mbql
                             :joins    [{:lib/type   :mbql/join
                                         :alias      "c"
                                         :conditions [[:=
                                                       {:lib/uuid "43813e7b-ebf7-4278-8ab4-af23be9ffc0d"}
                                                       [:field
                                                        {:lib/uuid "b8ad483b-1ff8-4979-bb3e-c006fe5caf46"}
                                                        61325]
                                                       [:field
                                                        {:base-type :type/BigInteger, :join-alias "c", :lib/uuid "3000ef3f-a190-4f47-88df-404150748352"}
                                                        "ID"]]]
                                         :stages     [{:lib/type :mbql.stage/native
                                                       :native   "SELECT * FROM categories WHERE name = ?;"
                                                       :params   ["BBQ"]}]}]}]}]
      (is (=? {:type  :query
               :query {:joins [{:alias        "c"
                                :condition    [:= [:field 61325 nil] [:field "ID" {:base-type :type/BigInteger, :join-alias "c"}]]
                                :source-query {:native "SELECT * FROM categories WHERE name = ?;"
                                               :params ["BBQ"]}}]}}
              (lib.convert/->legacy-MBQL query))))))

(deftest ^:parallel metadata-roundtrip-test
  (testing "Do not convert lib keys to snake_case when converting metadata"
    (let [query           (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
                              lib/append-stage)
          columns         (lib/returned-columns query)
          test-cases      [{:mbql-5-path  [:stages 0 :lib/stage-metadata :columns]
                            :mbql-4-path  [:query :source-metadata]
                            :mbql-4-shape :legacy}
                           {:mbql-5-path  [:info :metadata/model-metadata]
                            :mbql-4-path  [:info :metadata/model-metadata]
                            :mbql-4-shape :lib}
                           {:mbql-5-path  [:info :pivot/result-metadata]
                            :mbql-4-path  [:info :pivot/result-metadata]
                            :mbql-4-shape :lib}]
          expected-shapes {:legacy [{:name                     "ID"
                                     :base_type                :type/BigInteger
                                     :lib/desired-column-alias "ID"}
                                    {:name                     "NAME"
                                     :base_type                :type/Text
                                     :lib/desired-column-alias "NAME"
                                     :fingerprint              {:global {}
                                                                :type   {:type/Text {}}}}]
                           :lib    [{:name                     "ID"
                                     :base-type                :type/BigInteger
                                     :lib/desired-column-alias "ID"}
                                    {:name                     "NAME"
                                     :base-type                :type/Text
                                     :lib/desired-column-alias "NAME"
                                     :fingerprint              {:global {}
                                                                :type   {:type/Text {}}}}]}]
      (testing "5 => 4"
        (doseq [{:keys [mbql-5-path mbql-4-path mbql-4-shape]} test-cases]
          (testing (pr-str mbql-5-path)
            (let [query (assoc-in query mbql-5-path columns)]
              (is (=? (assoc-in {} mbql-4-path (expected-shapes mbql-4-shape))
                      (lib.convert/->legacy-MBQL query)))))))
      (testing "4 => 5"
        (doseq [{:keys [mbql-5-path mbql-4-path mbql-4-shape]} test-cases]
          (testing (pr-str mbql-4-path)
            (let [query (-> {:database 1, :type :query, :query {:source-query {}}}
                            (assoc-in mbql-4-path (case mbql-4-shape
                                                    :lib    columns
                                                    :legacy (#'lib.convert/stage-metadata->legacy-metadata {:columns columns}))))]
              (is (=? (assoc-in {:stages [{} {}]} mbql-5-path (expected-shapes :lib))
                      (lib.convert/->pMBQL query))))))))))

(deftest ^:parallel join-with-fields-in-last-stage-to-legacy-test
  (testing "converting a join whose last stage has :fields to legacy should not stomp on join :field (QUE-1603)"
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :joins        [{:lib/type :mbql/join
                                             :alias    "J"
                                             :stages   [{:lib/type     :mbql.stage/mbql
                                                         :source-table 2
                                                         :fields       [[:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
                                                                        [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 2]]}]
                                             :fields   [[:field {:lib/uuid "00000000-0000-0000-0000-000000000003", :join-alias "J"} 1]]
                                             :conditions [[:= {:lib/uuid "00000000-0000-0000-0000-000000000004"} 1 2]]}]}]}]
      (is (= {:type  :query
              :query {:source-table 1
                      :joins        [{:alias        "J"
                                      :source-query {:source-table 2
                                                     :fields       [[:field 1 nil]
                                                                    [:field 2 nil]]}
                                      :fields       [[:field 1 {:join-alias "J"}]]
                                      :condition    [:= 1 2]}]}}
             (lib.convert/->legacy-MBQL query)
             ;; make sure roundtripping doesn't introduce extra stages.
             (-> query
                 lib.convert/->legacy-MBQL
                 lib.convert/->pMBQL
                 lib.convert/->legacy-MBQL))))))

(deftest ^:parallel join-with-fields-in-last-stage-to-legacy-test-2
  (testing "converting a join whose last stage has :fields to legacy should put :fields in :source-query even if join does not have :fields"
    (let [query {:lib/type :mbql/query
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :joins        [{:lib/type   :mbql/join
                                             :alias      "J"
                                             :stages     [{:lib/type     :mbql.stage/mbql
                                                           :source-table 2
                                                           :fields       [[:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1]
                                                                          [:field {:lib/uuid "00000000-0000-0000-0000-000000000002"} 2]]}]
                                             :conditions [[:= {:lib/uuid "00000000-0000-0000-0000-000000000003"} 1 2]]}]}]}]
      (is (= {:type  :query
              :query {:source-table 1
                      :joins        [{:alias        "J"
                                      :source-query {:source-table 2
                                                     :fields       [[:field 1 nil]
                                                                    [:field 2 nil]]}
                                      :condition    [:= 1 2]}]}}
             (lib.convert/->legacy-MBQL query)
             ;; make sure roundtripping doesn't introduce extra stages.
             (-> query
                 lib.convert/->legacy-MBQL
                 lib.convert/->pMBQL
                 lib.convert/->legacy-MBQL))))))

(deftest ^:parallel do-not-add-extra-stages-to-join-test
  (is (=? {:stages [{:source-table 45060
                     :joins        [{:alias  "PRODUCTS__via__PRODUCT_ID"
                                     :stages [{:source-table 45050
                                               :fields       [[:field {:base-type :type/BigInteger} 45500]
                                                              [:field {:base-type :type/Text} 45507]]}]}]}]}
          (lib.convert/->pMBQL {:database 45001
                                :type     :query
                                :query    {:source-table 45060
                                           :joins        [{:strategy     :left-join
                                                           :alias        "PRODUCTS__via__PRODUCT_ID"
                                                           :fk-field-id  45607
                                                           :condition    [:=
                                                                          [:field 45607 nil]
                                                                          [:field 45500 {:join-alias "PRODUCTS__via__PRODUCT_ID"}]]
                                                           :source-query {:source-table 45050
                                                                          :fields       [[:field 45500 {:base-type :type/BigInteger}]
                                                                                         [:field 45507 {:base-type :type/Text}]]}}]}}))))

(deftest ^:parallel mongo-native-query->legacy-test
  (testing "Don't fail if we run into MongoDB :projections that sorta look like aggregation clauses"
    (let [query {:lib/type     :mbql/query
                 :stages       [{:lib/type    :mbql.stage/native
                                 :projections [:count]
                                 :collection  "venues"
                                 :native      [{"$project" {"price" "$price"}}
                                               {"$match" {"price" {"$eq" 1}}}
                                               {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                               {"$sort" {"_id" 1}}
                                               {"$project" {"_id" false, "count" true}}]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}]
      (is (=? {:native {:projections [:count]}}
              (lib.convert/->legacy-MBQL query))))))

(deftest ^:parallel between-with-options->legacy-test
  (is (= [:between
          [:field 72922 {:base-type :type/Text}]
          [:relative-datetime -15 :day]
          [:relative-datetime 0 :day]]
         (lib.convert/->legacy-MBQL [:between
                                     {:include-current true,
                                      :lib/uuid        "b8991b40-d452-4922-8768-b07f6f2b1918"}
                                     [:field
                                      {:base-type :type/Text
                                       :lib/uuid  "408cebeb-4511-4e3f-87c4-bc9d9cb84eca"}
                                      72922]
                                     [:relative-datetime
                                      {:lib/uuid "4eeca5bb-1614-48d1-8bfd-30c91dd4f546"}
                                      -15
                                      :day]
                                     [:relative-datetime
                                      {:lib/uuid "85a69d68-a2df-4c22-8a45-2203c837d3bf"}
                                      0
                                      :day]]))))

(deftest ^:parallel and-or-with-options->legacy-test
  (doseq [tag [:and :or]]
    (is (= [tag
            [:starts-with [:field 243 {:base-type :type/Text}] "B" {:case-sensitive false}]
            [:starts-with [:field 243 {:base-type :type/Text}] "C" {:case-sensitive false}]]
           (lib.convert/->legacy-MBQL
            [tag
             {:lib/uuid "fd823910-ffc9-4508-a6af-fa37fe29514d", :case-sensitive false}
             [:starts-with
              {:case-sensitive false, :lib/uuid "dc413cb8-429d-4103-aaa4-06e3d3bf0a4d"}
              [:field {:base-type :type/Text, :lib/uuid "b94a285d-32a5-45ad-a261-d4c67f1af8db", :effective-type :type/Text} 243]
              "B"]
             [:starts-with
              {:case-sensitive false, :lib/uuid "92c8ee03-6bc6-45c9-865c-57d0c5d53e23"}
              [:field {:base-type :type/Text, :lib/uuid "044811f6-9e30-4c42-b5b6-6afde5031675", :effective-type :type/Text} 243]
              "C"]])))))

(deftest ^:parallel field-name-ref-to-legacy-never-remove-base-type-test
  (testing "never remove :base-type from a :field name ref regardless of :metabase.lib.query/transformation-added-base-type"
    (is (= [:field "USER_ID" {:base-type :type/Integer, :join-alias "ord1"}]
           (lib.convert/->legacy-MBQL [:field {:lib/uuid                                          "47afe974-396c-4213-8736-859399ba5e7e"
                                               :base-type                                         :type/Integer
                                               :join-alias                                        "ord1"
                                               :metabase.lib.query/transformation-added-base-type true}
                                       "USER_ID"])))))

(deftest ^:parallel dimension->mbql5-test
  (is (=? [:dimension
           {:stage-number 0, :lib/uuid string?}
           [:field {:base-type :type/BigInteger, :lib/uuid string?} 49]]
          (lib.convert/->pMBQL [:dimension [:field 49 {:base-type :type/BigInteger}] {:stage-number 0}]))))

(deftest ^:parallel ->legacy-MBQL-idempotence-test
  (let [query {:database 1493
               :type     :query
               :query    {:aggregation  [[:count]]
                          :breakout     [[:field 76313 {:source-field 76299}]]
                          :source-table 11759
                          :expressions  {"TestColumn" [:+ 1 1]}}}]
    (is (= query
           (lib.convert/->legacy-MBQL query)))))

(deftest ^:parallel case-schema-aggregation-test
  (is (= [:aggregation-options
          [:case
           [[[:< [:aggregation 0 {:base-type :type/Float}] 0.591] "60%"]]]
          {:name "A", :display-name "B"}]
         (mbql.normalize/normalize :metabase.legacy-mbql.schema/aggregation-options
                                   ["aggregation-options"
                                    ["case"
                                     [[["<" ["aggregation" 0 {"base-type" "type/Float"}] 0.591] "60%"]]]
                                    {"name" "A", "display-name" "B"}]))))
