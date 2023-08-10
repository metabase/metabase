(ns metabase.lib.join.conditions-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel join-condition-field-metadata-test
  (testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                          (lib/query meta/metadata-provider (meta/table-metadata :categories))
          q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
          venues-category-id-metadata (meta/field-metadata :venues :category-id)
          categories-id-metadata      (lib.metadata/stage-column q2 "ID")]
      (let [clause (lib/join-clause q2 [(lib/= categories-id-metadata venues-category-id-metadata)])]
        (is (=? {:lib/type    :mbql/join
                 :lib/options {:lib/uuid string?}
                 :stages      [{:lib/type     :mbql.stage/mbql
                                :source-table (meta/id :venues)}]
                 :conditions  [[:=
                                {:lib/uuid string?}
                                [:field {:base-type :type/BigInteger, :lib/uuid string?} "ID"]
                                [:field {:lib/uuid string?} (meta/id :venues :category-id)]]]}
                clause)))
      (is (=? {:database (meta/id)
               :stages   [{:source-table (meta/id :categories)
                           :joins        [{:lib/type    :mbql/join
                                           :lib/options {:lib/uuid string?}
                                           :alias       "Venues"
                                           :stages      [{:source-table (meta/id :venues)}]
                                           :conditions  [[:=
                                                          {:lib/uuid string?}
                                                          [:field
                                                           {:base-type :type/BigInteger
                                                            :lib/uuid string?
                                                            :join-alias (symbol "nil #_\"key is not present.\"")}
                                                           "ID"]
                                                          [:field
                                                           {:lib/uuid string?
                                                            :join-alias "Venues"}
                                                           (meta/id :venues :category-id)]]]}]}]}
              (-> q1
                  (lib/join (lib/join-clause q2 [(lib/= categories-id-metadata venues-category-id-metadata)]))
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel with-join-conditions-empty-test
  (let [query  lib.tu/query-with-join
        [join] (lib/joins query)]
    (are [new-conditions] (nil? (lib/join-conditions (lib/with-join-conditions join new-conditions)))
      nil
      [])))

(deftest ^:parallel with-join-conditions-add-alias-test
  (testing "with-join-conditions should add join alias to RHS of conditions (#32558)"
    (let [query      lib.tu/query-with-join
          [join]     (lib/joins query)
          conditions (lib/join-conditions join)]
      (is (=? [[:= {}
                [:field {} (meta/id :venues :category-id)]
                [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
              conditions))
      (testing "Replace conditions; should add join alias"
        (let [new-conditions [(lib/=
                               (meta/field-metadata :venues :id)
                               (meta/field-metadata :categories :id))
                              (lib/=
                               (meta/field-metadata :venues :category-id)
                               (meta/field-metadata :categories :id))]]
          ;; test with both one new condition and with multiple new conditions.
          (doseq [new-conditions [(take 1 new-conditions)
                                  new-conditions]
                  ;; test with both normal MBQL clauses and with external-op representations.
                  new-conditions [new-conditions
                                  (mapv lib/external-op new-conditions)]]
            (testing (str "\nconditions =\n" (u/pprint-to-str new-conditions))
              (is (=? (concat
                       [[:= {}
                         [:field {} (meta/id :venues :id)]
                         [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
                       (when (= (count new-conditions) 2)
                         [[:= {}
                           [:field {} (meta/id :venues :category-id)]
                           [:field {:join-alias "Cat"} (meta/id :categories :id)]]]))
                      (lib/join-conditions (lib/with-join-conditions join new-conditions)))))))))))

(deftest ^:parallel with-join-conditions-do-not-add-alias-when-already-present-test
  (testing "with-join-conditions should not replace an existing join alias (don't second guess explicit aliases)"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)]
      (let [new-conditions [(lib/=
                             (meta/field-metadata :venues :id)
                             (-> (meta/field-metadata :categories :id)
                                 (lib/with-join-alias "My Join")))]]
        (is (=? [[:= {}
                  [:field {} (meta/id :venues :id)]
                  [:field {:join-alias "My Join"} (meta/id :categories :id)]]]
                (lib/join-conditions (lib/with-join-conditions join new-conditions))))))))

(deftest ^:parallel with-join-conditions-join-has-no-alias-yet-test
  (testing "with-join-conditions should work if join doesn't yet have an alias"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)
          join   (lib/with-join-alias join nil)]
      (is (nil? (lib.join/current-join-alias join)))
      (let [new-conditions [(lib/=
                             (meta/field-metadata :venues :id)
                             (meta/field-metadata :categories :id))]
            join' (lib/with-join-conditions join new-conditions)]
        (is (=? [[:= {}
                  [:field {} (meta/id :venues :id)]
                  [:field {:join-alias (symbol "nil #_\"key is not present.\"")} (meta/id :categories :id)]]]
                (lib/join-conditions join')))
        (testing "Adding an alias later with lib/with-join-alias should update conditions that are missing aliases"
          (let [join'' (lib/with-join-alias join' "New Alias")]
            (is (=? [[:= {}
                      [:field {} (meta/id :venues :id)]
                      [:field {:join-alias "New Alias"} (meta/id :categories :id)]]]
                    (lib/join-conditions join'')))))))))

(deftest ^:parallel with-join-conditions-do-not-add-alias-to-complex-conditions
  (testing "with-join-conditions should not add aliases to non-binary filter clauses"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)]
      (testing :between
        (let [new-conditions [(lib/between
                               (meta/field-metadata :venues :id)
                               (meta/field-metadata :categories :id)
                               1)]
              conditions' (lib/join-conditions (lib/with-join-conditions join new-conditions))]
          (is (=? [[:between {}
                    [:field {} (meta/id :venues :id)]
                    [:field {:join-alias (symbol "nil #_\"key is not present.\"")}
                     (meta/id :categories :id)]
                    1]]
                  conditions'))))
      (testing :and
        (let [new-conditions [(lib/and
                               (lib/=
                                (meta/field-metadata :venues :id)
                                (meta/field-metadata :categories :id))
                               (lib/=
                                (meta/field-metadata :venues :category-id)
                                (meta/field-metadata :categories :id)))]
              conditions' (lib/join-conditions (lib/with-join-conditions join new-conditions))]
          (is (=? [[:and {}
                    [:= {}
                     [:field {} (meta/id :venues :id)]
                     [:field {:join-alias (symbol "nil #_\"key is not present.\"")} (meta/id :categories :id)]]
                    [:= {}
                     [:field {} (meta/id :venues :category-id)]
                     [:field {:join-alias (symbol "nil #_\"key is not present.\"")} (meta/id :categories :id)]]]]
                  conditions')))))))

(deftest ^:parallel join-condition-lhs-columns-test
  (let [query lib.tu/venues-query]
    (doseq [rhs [nil (lib/with-join-alias (lib.metadata/field query (meta/id :venues :category-id)) "Cat")]]
      (testing (str "rhs = " (pr-str rhs))
        ;; sort PKs then FKs then everything else
        (is (=? [{:lib/desired-column-alias "ID"}
                 {:lib/desired-column-alias "CATEGORY_ID"}
                 {:lib/desired-column-alias "NAME"}
                 {:lib/desired-column-alias "LATITUDE"}
                 {:lib/desired-column-alias "LONGITUDE"}
                 {:lib/desired-column-alias "PRICE"}]
                (lib/join-condition-lhs-columns query nil nil rhs)))))))

(deftest ^:parallel join-condition-lhs-columns-with-previous-join-test
  (testing "Include columns from previous join(s)"
    (let [query lib.tu/query-with-join-with-explicit-fields]
      (doseq [rhs [nil (lib/with-join-alias (lib.metadata/field query (meta/id :users :id)) "User")]]
        (testing (str "rhs = " (pr-str rhs))
          (is (=? [{:lib/desired-column-alias "ID"}
                   {:lib/desired-column-alias "Cat__ID"}
                   {:lib/desired-column-alias "CATEGORY_ID"}
                   {:lib/desired-column-alias "NAME"}
                   {:lib/desired-column-alias "LATITUDE"}
                   {:lib/desired-column-alias "LONGITUDE"}
                   {:lib/desired-column-alias "PRICE"}
                   {:lib/desired-column-alias "Cat__NAME"}]
                  (lib/join-condition-lhs-columns query nil nil rhs)))
          (is (= (lib/join-condition-lhs-columns query nil nil rhs)
                 (lib/join-condition-lhs-columns query -1 nil nil rhs))))))))

(deftest ^:parallel join-condition-lhs-columns-exclude-columns-from-existing-join-test
  (testing "Ignore columns added by a join or any subsequent joins (#32005)"
    (let [query                  (-> lib.tu/query-with-join
                                     (lib.tu/add-joins "C2" "C3"))
          [join-1 join-2 join-3] (lib/joins query)]
      (is (=? {:lib/type :mbql/join
               :alias    "Cat"}
              join-1))
      (is (=? {:lib/type :mbql/join
               :alias    "C2"}
              join-2))
      (is (=? {:lib/type :mbql/join
               :alias    "C3"}
              join-3))
      (are [join expected] (= expected
                              (map :lib/desired-column-alias (lib/join-condition-lhs-columns query join nil nil)))
        nil
        ["ID" "Cat__ID" "C2__ID" "C3__ID" "CATEGORY_ID" "NAME" "LATITUDE" "LONGITUDE" "PRICE" "Cat__NAME" "C2__NAME" "C3__NAME"]

        join-1
        ["ID" "CATEGORY_ID" "NAME" "LATITUDE" "LONGITUDE" "PRICE"]

        join-2
        ["ID" "Cat__ID" "CATEGORY_ID" "NAME" "LATITUDE" "LONGITUDE" "PRICE" "Cat__NAME"]

        join-3
        ["ID" "Cat__ID" "C2__ID" "CATEGORY_ID" "NAME" "LATITUDE" "LONGITUDE" "PRICE" "Cat__NAME" "C2__NAME"]))))

(def ^:private join-for-query-with-join
  (first (lib/joins lib.tu/query-with-join)))

(def ^:private condition-for-query-with-join
  (first (lib/join-conditions join-for-query-with-join)))

(def ^:private lhs-for-query-with-join
  (first (:args (lib/external-op condition-for-query-with-join))))

(def ^:private rhs-for-query-with-join
  (second (:args (lib/external-op condition-for-query-with-join))))

(deftest ^:parallel condition-for-query-with-join-test
  (is (=? [:= {}
           [:field {} (meta/id :venues :category-id)]
           [:field {} (meta/id :categories :id)]]
          condition-for-query-with-join))
  (is (=? [:field {} (meta/id :venues :category-id)]
          lhs-for-query-with-join))
  (is (=? [:field {} (meta/id :categories :id)]
          rhs-for-query-with-join)))

(deftest ^:parallel join-condition-lhs-columns-mark-selected-test
  (testing "#32438"
    (is (=? [{:long-display-name "ID"}
             {:long-display-name "Category ID", :selected true}
             {:long-display-name "Name"}
             {:long-display-name "Latitude"}
             {:long-display-name "Longitude"}
             {:long-display-name "Price"}]
            (map (partial lib/display-info lib.tu/query-with-join)
                 (lib/join-condition-lhs-columns lib.tu/query-with-join
                                                 join-for-query-with-join
                                                 lhs-for-query-with-join
                                                 rhs-for-query-with-join))))))

(deftest ^:parallel join-condition-rhs-columns-join-table-test
  (testing "RHS columns when building a join against a Table"
    (doseq [query [lib.tu/venues-query
                   lib.tu/query-with-join]]
      (let [cols (lib/join-condition-rhs-columns query (meta/table-metadata :categories) nil nil)]
        (is (=? [{:display-name "ID", :lib/source :source/joins, :table-id (meta/id :categories)}
                 {:display-name "Name", :lib/source :source/joins, :table-id (meta/id :categories)}]
                cols))
        (is (=? [{:display-name "ID", :is-from-join true}
                 {:display-name "Name", :is-from-join true}]
                (for [col cols]
                  (lib/display-info query col))))))))

(deftest ^:parallel join-condition-rhs-columns-join-card-test
  (testing "RHS columns when building a join against"
    (doseq [query            [lib.tu/venues-query
                              lib.tu/query-with-join]
            [card-type card] {"Native" lib.tu/categories-native-card
                              "MBQL"   lib.tu/categories-mbql-card}]
      (testing (str "a " card-type " Card")
        (let [cols (lib/join-condition-rhs-columns query card nil nil)]
          (is (=? [{:display-name "ID", :lib/source :source/joins, :lib/card-id 1}
                   {:display-name "Name", :lib/source :source/joins, :lib/card-id 1}]
                  cols))
          (is (=? [{:display-name "ID", :is-from-join true}
                   {:display-name "Name", :is-from-join true}]
                  (for [col cols]
                    (lib/display-info query col)))))))))

(deftest ^:parallel join-condition-rhs-columns-existing-join-test
  (testing "RHS columns for existing join"
    (let [cols (lib/join-condition-rhs-columns lib.tu/query-with-join join-for-query-with-join nil nil)]
      (is (=? [{:display-name "ID",   :lib/source :source/joins, ::lib.join/join-alias "Cat"}
               {:display-name "Name", :lib/source :source/joins, ::lib.join/join-alias "Cat"}]
              cols))
      (testing `lib/display-info
        (is (=? [{:display-name "ID", :is-from-join true}
                 {:display-name "Name", :is-from-join true}]
                (for [col cols]
                  (lib/display-info lib.tu/query-with-join col))))))))

(deftest ^:parallel join-condition-rhs-columns-test-2
  (let [query lib.tu/venues-query]
    (doseq [lhs          [nil (lib.metadata/field query (meta/id :venues :id))]
            joined-thing [(meta/table-metadata :venues)
                          meta/saved-question-CardMetadata]]
      (testing (str "lhs = " (pr-str lhs)
                    "\njoined-thing = " (pr-str joined-thing))
        (is (=? [{:lib/desired-column-alias "ID"}
                 {:lib/desired-column-alias "CATEGORY_ID"}
                 {:lib/desired-column-alias "NAME"}
                 {:lib/desired-column-alias "LATITUDE"}
                 {:lib/desired-column-alias "LONGITUDE"}
                 {:lib/desired-column-alias "PRICE"}]
                (lib/join-condition-rhs-columns query joined-thing lhs nil)))))))

(deftest ^:parallel join-condition-rhs-columns-mark-selected-test
  (testing "#32438"
    (is (=? [{:display-name "ID", :selected true}
             {:display-name "Name"}]
            (map (partial lib/display-info lib.tu/query-with-join)
                 (lib/join-condition-rhs-columns lib.tu/query-with-join
                                                 join-for-query-with-join
                                                 lhs-for-query-with-join
                                                 rhs-for-query-with-join))))))

(deftest ^:parallel join-condition-operators-test
  ;; just make sure that this doesn't barf and returns the expected output given any combination of LHS or RHS fields
  ;; for now until we actually implement filtering there
  (let [query lib.tu/venues-query]
    (doseq [lhs [nil (lib.metadata/field query (meta/id :categories :id))]
            rhs [nil (lib.metadata/field query (meta/id :venues :category-id))]]
      (testing (pr-str (list `lib/join-condition-operators `lib.tu/venues-query lhs rhs))
        (is (=? [{:short :=, :default true}
                 {:short :>}
                 {:short :<}
                 {:short :>=}
                 {:short :<=}
                 {:short :!=}]
                (lib/join-condition-operators lib.tu/venues-query lhs rhs)))
        (is (=? [{:short-name "=", :display-name "=", :long-display-name "Is"}
                 {:short-name ">", :display-name ">", :long-display-name "Greater than"}
                 {:short-name "<", :display-name "<", :long-display-name "Less than"}
                 {:short-name ">=", :display-name "≥", :long-display-name "Greater than or equal to"}
                 {:short-name "<=", :display-name "≤", :long-display-name "Less than or equal to"}
                 {:short-name "!=", :display-name "≠", :long-display-name "Is not"}]
                (map (partial lib/display-info query)
                     (lib/join-condition-operators lib.tu/venues-query lhs rhs))))
        (is (= (lib/join-condition-operators lib.tu/venues-query lhs rhs)
               (lib/join-condition-operators lib.tu/venues-query -1 lhs rhs))))
      (testing `lib/display-info
        (is (=? [{:short-name "=", :default true}
                 {:short-name ">"}
                 {:short-name "<"}
                 {:short-name ">="}
                 {:short-name "<="}
                 {:short-name "!="}]
                (map (partial lib/display-info query)
                     (lib/join-condition-operators lib.tu/venues-query lhs rhs))))))))

(deftest ^:parallel suggested-join-condition-test
  (testing "DO suggest a join condition for an FK -> PK relationship"
    (are [query] (=? [:=
                      {}
                      [:field {} (meta/id :venues :category-id)]
                      [:field {} (meta/id :categories :id)]]
                     (lib/suggested-join-condition
                      query
                      (meta/table-metadata :categories)))
      ;; plain query
      lib.tu/venues-query

      ;; query with an aggregation (FK column is not exported, but is still "visible")
      (-> lib.tu/venues-query
          (lib/aggregate (lib/count))))))

(deftest ^:parallel suggested-join-condition-pk->fk-test
  ;; this is to preserve the existing behavior from MLv1, it doesn't necessarily make sense, but we don't want to have
  ;; to update a million tests, right? Once v1-compatible joins lands then maybe we can go in and make this work,
  ;; since it seems like it SHOULD work.
  (testing "DO suggest join conditions for a PK -> FK relationship"
    (is (=? [:=
             {}
             [:field {} (meta/id :categories :id)]
             [:field {} (meta/id :venues :category-id)]]
            (lib/suggested-join-condition
             (lib/query meta/metadata-provider (meta/table-metadata :categories))
             (meta/table-metadata :venues))))))

(deftest ^:parallel suggested-join-condition-fk-from-join-test
  (testing "DO suggest join conditions for a FK -> PK relationship if the FK comes from a join"
    (is (=? [:=
             {}
             [:field {:join-alias "Venues"} (meta/id :venues :category-id)]
             [:field {} (meta/id :categories :id)]]
            (lib/suggested-join-condition
             (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                 (lib/join (-> (lib/join-clause
                                (meta/table-metadata :venues)
                                [(lib/= (meta/field-metadata :checkins :venue-id)
                                        (-> (meta/field-metadata :venues :id)
                                            (lib/with-join-alias "Venues")))])
                               (lib/with-join-alias "Venues"))))
             (meta/table-metadata :categories))))))

(deftest ^:parallel join-conditions-test
  (let [joins (lib/joins lib.tu/query-with-join)]
    (is (= 1
           (count joins)))
    (is (=? [[:=
              {}
              [:field {} (meta/id :venues :category-id)]
              [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
            (lib/join-conditions (first joins))))))

(deftest ^:parallel join-condition-update-temporal-bucketing-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        products-created-at (meta/field-metadata :products :created-at)
        orders-created-at (meta/field-metadata :orders :created-at)]
    (is (=? [:= {}
             [:field {:temporal-unit :year} (meta/id :orders :created-at)]
             [:field {:temporal-unit :year} (meta/id :products :created-at)]]
            (lib/join-condition-update-temporal-bucketing
              query
              -1
              (lib/= orders-created-at
                     products-created-at)
              :year)))
    (is (=? [:= {}
             [:field (complement :temporal-unit) (meta/id :orders :id)]
             [:field {:temporal-unit :year} (meta/id :products :created-at)]]
            (lib/join-condition-update-temporal-bucketing
              query
              -1
              (lib/= (meta/field-metadata :orders :id)
                     products-created-at)
              :year)))
    (testing "removing with nil"
      (is (=? [:= {}
               [:field (complement :temporal-unit) (meta/id :orders :created-at)]
               [:field (complement :temporal-unit) (meta/id :products :created-at)]]
              (lib/join-condition-update-temporal-bucketing
                query
                -1
                (lib/join-condition-update-temporal-bucketing
                  query
                  -1
                  (lib/= orders-created-at
                         products-created-at)
                  :year)
                nil))))
    (is (thrown-with-msg?
          #?(:clj AssertionError :cljs :default)
          #"Non-standard join condition."
          (lib/join-condition-update-temporal-bucketing
            query
            -1
            (lib/= (lib/+ (meta/field-metadata :orders :id) 1)
                   products-created-at)
            :year)))))

(deftest ^:parallel join-condition-columns-handle-temporal-units-test
  (testing "join-condition-lhs-columns and -rhs-columns should correctly mark columns regardless of :temporal-unit (#32390)\n"
    (let [orders-query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
          query             (-> orders-query
                                (lib/join (-> (lib/join-clause (meta/table-metadata :products))
                                              (lib/with-join-alias "P")
                                              (lib/with-join-conditions [(lib/= (-> (meta/field-metadata :orders :created-at)
                                                                                    (lib/with-temporal-bucket :month))
                                                                                (-> (meta/field-metadata :products :created-at)
                                                                                    (lib/with-temporal-bucket :month)))]))))
          [join]            (lib/joins query)
          [condition]       (lib/join-conditions join)
          {[lhs rhs] :args} (lib/external-op condition)]
      (is (=? [:field {:temporal-unit :month} integer?]
              lhs))
      (is (=? [:field {:temporal-unit :month, :join-alias "P"} integer?]
              rhs))
      (doseq [lhs          [lhs nil]
              rhs          [rhs nil]
              ;; if we specify lhs/rhs, then we should be able to mark things selected correctly when passing in a
              ;; Table (joinable) instead of an actual join
              [query join] (concat
                            [[query join]]
                            (when (and lhs rhs)
                              [[orders-query (meta/table-metadata :products)]]))]
        (testing (pr-str (list `lib/join-condition-lhs-columns 'query (:lib/type join) (when lhs 'lhs) (when rhs 'rhs)))
          (is (= [{:name "ID", :selected? false}
                  {:name "USER_ID", :selected? false}
                  {:name "PRODUCT_ID", :selected? false}
                  {:name "SUBTOTAL", :selected? false}
                  {:name "TAX", :selected? false}
                  {:name "TOTAL", :selected? false}
                  {:name "DISCOUNT", :selected? false}
                  {:name "CREATED_AT", :selected? true}
                  {:name "QUANTITY", :selected? false}]
                 (mapv #(select-keys % [:name :selected?])
                       (lib/join-condition-lhs-columns query join lhs rhs)))))
        (testing (pr-str (list `lib/join-condition-rhs-columns 'query (:lib/type join) (when lhs 'lhs) (when rhs 'rhs)))
          (is (= [{:name "ID", :selected? false}
                  {:name "EAN", :selected? false}
                  {:name "TITLE", :selected? false}
                  {:name "CATEGORY", :selected? false}
                  {:name "VENDOR", :selected? false}
                  {:name "PRICE", :selected? false}
                  {:name "RATING", :selected? false}
                  {:name "CREATED_AT", :selected? true}]
                 (mapv #(select-keys % [:name :selected?])
                       (lib/join-condition-rhs-columns query join lhs rhs)))))))))
