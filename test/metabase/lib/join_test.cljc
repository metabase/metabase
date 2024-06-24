(ns metabase.lib.join-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.mocks-31769 :as lib.tu.mocks-31769]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private absent-key-marker (symbol "nil #_\"key is not present.\""))

(deftest ^:parallel resolve-join-test
  (let [query       lib.tu/venues-query
        join-clause (-> (lib/join-clause
                         (meta/table-metadata :categories)
                         [(lib/=
                           (meta/field-metadata :venues :category-id)
                           (lib/with-join-alias (meta/field-metadata :categories :id) "CATEGORIES__via__CATEGORY_ID"))])
                        (lib/with-join-alias "CATEGORIES__via__CATEGORY_ID"))
        query       (lib/join query join-clause)]
    (is (= join-clause
           (lib.join/resolve-join query -1 "CATEGORIES__via__CATEGORY_ID")))))

(deftest ^:parallel join-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :alias       "Categories"
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :source-table (meta/id :categories)}]
                                       :conditions  [[:=
                                                      {:lib/uuid string?}
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias absent-key-marker}
                                                       (meta/id :venues :category-id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias "Categories"}
                                                       (meta/id :categories :id)]]]
                                       :fields      :all}]}]}
          (let [q lib.tu/venues-query
                j (lib/query meta/metadata-provider (meta/table-metadata :categories))]
            (lib/join q (lib/join-clause j [{:lib/type :lib/external-op
                                             :operator :=
                                             :args     [(lib/ref (meta/field-metadata :venues :category-id))
                                                        (lib/ref (meta/field-metadata :categories :id))]}]))))))

(deftest ^:parallel join-clause-test
  (testing "Should have :fields :all by default (#32419)"
    (is (=? {:lib/type    :mbql/join
             :stages      [{:lib/type     :mbql.stage/mbql
                            :source-table (meta/id :orders)}]
             :lib/options {:lib/uuid string?}
             :fields      :all}
            (lib/join-clause (meta/table-metadata :orders)))))
  (testing "Should allow specifying the join strategy when creating a join clause"
    (is (= [:left-join :right-join :inner-join]
           (let [query lib.tu/query-with-join
                 product-table (meta/table-metadata :products)
                 products-id (meta/id :products :id)
                 orders-product-id (meta/id :orders :product-id)
                 join-conditions [(lib/= orders-product-id products-id)]
                 join-strategies (lib/available-join-strategies query)]
             (into [] (comp
                       (map #(lib/join-clause product-table join-conditions %))
                       (map :strategy))
                   join-strategies)))))
  (testing "source-card"
    (let [query {:lib/type :mbql/query
                 :lib/metadata lib.tu/metadata-provider-with-mock-cards
                 :database (meta/id)
                 :stages [{:lib/type :mbql.stage/mbql
                           :source-card (:id (lib.tu/mock-cards :orders))}]}
          product-card (lib.tu/mock-cards :products)
          [_ orders-product-id] (lib/join-condition-lhs-columns query product-card nil nil)
          [products-id] (lib/join-condition-rhs-columns query product-card orders-product-id nil)]
      (is (=? {:stages [{:joins [{:stages [{:source-card (:id product-card)}]}]}]}
           (lib/join query (lib/join-clause product-card [(lib/= orders-product-id products-id)]))))))
  (testing "source-table"
    (let [query {:lib/type :mbql/query
                 :lib/metadata lib.tu/metadata-provider-with-mock-cards
                 :database (meta/id)
                 :stages [{:lib/type :mbql.stage/mbql
                           :source-card (:id (lib.tu/mock-cards :orders))}]}
          product-table (meta/table-metadata :products)
          [_ orders-product-id] (lib/join-condition-lhs-columns query product-table nil nil)
          [products-id] (lib/join-condition-rhs-columns query product-table orders-product-id nil)]
      (is (=? {:stages [{:joins [{:stages [{:source-table (:id product-table)}]}]}]}
              (lib/join query (lib/join-clause product-table [(lib/= orders-product-id products-id)])))))))

(deftest ^:parallel join-saved-question-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :categories)
                       :joins        [{:lib/type    :mbql/join
                                       :lib/options {:lib/uuid string?}
                                       :alias       "Venues"
                                       :stages      [{:lib/type     :mbql.stage/mbql
                                                      :source-table (meta/id :venues)}]
                                       :conditions  [[:=
                                                      {:lib/uuid string?}
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias absent-key-marker}
                                                       (meta/id :categories :id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias "Venues"}
                                                       (meta/id :venues :category-id)]]]}]}]}
          (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
              (lib/join (lib/join-clause
                         (lib.tu/query-with-stage-metadata-from-card meta/metadata-provider (:venues lib.tu/mock-cards))
                         [(lib/= (meta/field-metadata :categories :id)
                                 (meta/field-metadata :venues :category-id))]))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-condition-field-metadata-test
  (testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                          (lib/query meta/metadata-provider (meta/table-metadata :categories))
          q2                          (lib.tu/query-with-stage-metadata-from-card meta/metadata-provider (:venues lib.tu/mock-cards))
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
                                                            :join-alias absent-key-marker}
                                                           "ID"]
                                                          [:field
                                                           {:lib/uuid string?
                                                            :join-alias "Venues"}
                                                           (meta/id :venues :category-id)]]]}]}]}
              (-> q1
                  (lib/join (lib/join-clause q2 [(lib/= categories-id-metadata venues-category-id-metadata)]))
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel col-info-implicit-join-test
  (testing (str "when a `:field` with `:source-field` (implicit join) is used, we should add in `:fk-field-id` "
                "info about the source Field")
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.convert/->pMBQL
                  {:database (meta/id)
                   :type     :query
                   :query    {:source-table (meta/id :venues)
                              :fields       [[:field (meta/id :categories :name) {:source-field (meta/id :venues :category-id)}]]}}))]
      (is (=? [{:name        "NAME"
                :id          (meta/id :categories :name)
                :fk-field-id (meta/id :venues :category-id)
                :lib/source  :source/fields}]
              (lib/returned-columns query -1 query))))))

(deftest ^:parallel col-info-explicit-join-test
  (testing "Display name for a joined field should include a nice name for the join; include other info like :source-alias"
    (let [query {:lib/type     :mbql/query
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
                                                 :conditions  [[:=
                                                                {:lib/uuid "cc5f6c43-1acb-49c2-aeb5-e3ff9c70541f"}
                                                                (lib.tu/field-clause :venues :category-id)
                                                                (lib.tu/field-clause :categories :id {:join-alias "CATEGORIES__via__CATEGORY_ID"})]]
                                                 :strategy    :left-join
                                                 :fk-field-id (meta/id :venues :category-id)
                                                 :stages      [{:lib/type     :mbql.stage/mbql
                                                                :lib/options  {:lib/uuid "bbbae500-c972-4550-b100-e0584eb72c4d"}
                                                                :source-table (meta/id :categories)}]}]}]
                 :database     (meta/id)
                 :lib/metadata meta/metadata-provider}
          metadata (lib/returned-columns query)]
        (is (=? [(merge (meta/field-metadata :categories :name)
                        {:display-name         "Name"
                         :lib/source           :source/fields
                         ::lib.join/join-alias "CATEGORIES__via__CATEGORY_ID"})]
                metadata))
        (is (=? "CATEGORIES__via__CATEGORY_ID"
                (lib.join.util/current-join-alias (first metadata))))
        (is (=? [:field
                 {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                 (meta/id :categories :name)]
                (lib/ref (first metadata)))))))

(deftest ^:parallel join-against-source-card-metadata-test
  (let [metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                           meta/metadata-provider
                           [{:database (meta/id)
                             :type     :query
                             :query    {:source-table (meta/id :checkins)
                                        :aggregation  [[:count]]
                                        :breakout     [[:field (meta/id :checkins :user-id) nil]]}}])
        join              {:lib/type    :mbql/join
                           :lib/options {:lib/uuid "d7ebb6bd-e7ac-411a-9d09-d8b18329ad46"}
                           :stages      [{:lib/type    :mbql.stage/mbql
                                          :source-card 1}]
                           :alias       "checkins_by_user"
                           :conditions  [[:=
                                          {:lib/uuid "1cb124b0-757f-4717-b8ee-9cf12a7c3f62"}
                                          [:field
                                           {:lib/uuid "a2eb96a0-420b-4465-817d-f3c9f789eff4"}
                                           (meta/id :users :id)]
                                          [:field
                                           {:base-type  :type/Integer
                                            :join-alias "checkins_by_user"
                                            :lib/uuid   "b23a769d-774a-4eb5-8fb8-1f6a33c9a8d5"}
                                           "USER_ID"]]]
                           :fields      :all}
        query             {:lib/type     :mbql/query
                           :lib/metadata metadata-provider
                           :database     (meta/id)
                           :stages       [{:lib/type     :mbql.stage/mbql
                                           :source-table (meta/id :checkins)
                                           :joins        [join]}]}]
    (is (=? [{:id                       (meta/id :checkins :user-id)
              :name                     "USER_ID"
              :lib/source               :source/joins
              :lib/source-column-alias  "USER_ID"
              :lib/desired-column-alias "checkins_by_user__USER_ID"}
             {:name                     "count"
              :lib/source               :source/joins
              :lib/source-column-alias  "count"
              :lib/desired-column-alias "checkins_by_user__count"}]
            (lib/returned-columns query -1 join)))
    (is (= (lib.metadata/card metadata-provider 1)
           (lib.join/joined-thing query join)))))

(deftest ^:parallel joins-source-and-desired-aliases-test
  (let [query (-> lib.tu/venues-query
                  (lib/join (-> (lib/join-clause
                                 (meta/table-metadata :categories)
                                 [(lib/=
                                   (meta/field-metadata :venues :category-id)
                                   (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                (lib/with-join-alias "Cat")
                                (lib/with-join-fields :all)))
                  (lib/with-fields [(meta/field-metadata :venues :id)
                                    (lib/with-join-alias (meta/field-metadata :categories :id) "Cat")]))]
    (is (=? [{:name                     "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"
              :lib/source               :source/fields}
             {:name                     "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "Cat__ID"
              ::lib.join/join-alias     "Cat"
              :lib/source               :source/fields}
             {:name                     "NAME"
              :lib/source-column-alias  "NAME"
              :lib/desired-column-alias "Cat__NAME"
              ::lib.join/join-alias     "Cat"
              :lib/source               :source/joins}]
            (lib/returned-columns query)))
    (is (=? {:lib/type :metadata/table
             :db-id (meta/id)
             :name "CATEGORIES"
             :id (meta/id :categories)
             :display-name "Categories"}
            (lib.join/joined-thing query (first (lib/joins query)))))
    (is (=? [{:table             {:name              "VENUES"
                                  :display-name      "Venues"
                                  :long-display-name "Venues"
                                  :is-source-table   true}
              :effective-type    :type/BigInteger
              :long-display-name "ID"
              :display-name      "ID"}
             {:table             {:name              "CATEGORIES"
                                  :display-name      "Categories"
                                  :long-display-name "Categories"
                                  :is-source-table   false}
              :effective-type    :type/BigInteger
              :long-display-name "Cat → ID"
              :display-name      "ID"}
             {:table             {:name              "CATEGORIES"
                                  :display-name      "Categories"
                                  :long-display-name "Categories"
                                  :is-source-table   false}
              :effective-type    :type/Text
              :long-display-name "Cat → Name"
              :display-name      "Name"}]
            (map #(lib/display-info query %)
                 (lib/returned-columns query))))
    (testing "Introduce a new stage"
      (let [query' (lib/append-stage query)]
        (is (=? [{:name                     "ID"
                  :lib/source-column-alias  "ID"
                  :lib/desired-column-alias "ID"
                  :lib/source               :source/previous-stage}
                 {:name                     "ID"
                  :lib/source-column-alias  "Cat__ID"
                  :lib/desired-column-alias "Cat__ID"
                  :lib/source               :source/previous-stage}
                 {:name                     "NAME"
                  :lib/source-column-alias  "Cat__NAME"
                  :lib/desired-column-alias "Cat__NAME"
                  :lib/source               :source/previous-stage}]
                (lib/returned-columns query')))))))

(deftest ^:parallel default-columns-added-by-joins-deduplicate-names-test
  (let [join-alias "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        query      {:lib/type     :mbql/query
                    :lib/metadata meta/metadata-provider
                    :database     (meta/id)
                    :stages       [{:lib/type     :mbql.stage/mbql
                                    :source-table (meta/id :categories)
                                    :joins        [{:lib/type    :mbql/join
                                                    :lib/options {:lib/uuid "10ee93eb-6749-41ed-a48b-93c66427eb49"}
                                                    :alias       join-alias
                                                    :fields      [[:field
                                                                   {:join-alias join-alias
                                                                    :lib/uuid   "87ad4bf3-a00b-462a-b9cc-3dde44945d66"}
                                                                   (meta/id :categories :id)]]
                                                    :conditions  [[:=
                                                                   {:lib/uuid "dc8e675c-dc5f-43a1-a0c9-ff7f0a222fdc"}
                                                                   [:field
                                                                    {:lib/uuid "a2220121-04e0-4df0-8c67-7d17530e90e9"}
                                                                    (meta/id :categories :id)]
                                                                   [:field
                                                                    {:lib/uuid "c5203ef8-d56d-474c-b176-2853a3f017b0"}
                                                                    (meta/id :categories :id)]]]
                                                    :stages      [{:lib/type     :mbql.stage/mbql
                                                                   :lib/options  {:lib/uuid "e8888108-22a7-4f97-8315-ff63503634d7"}
                                                                   :source-table (meta/id :categories)}]}]}]}]
    (is (=? [{:name                     "ID"
              :display-name             "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "ID"}
             {:name                     "NAME"
              :display-name             "Name"
              :lib/source-column-alias  "NAME"
              :lib/desired-column-alias "NAME"}
             {:name                     "ID"
              :display-name             "ID"
              :lib/source-column-alias  "ID"
              :lib/desired-column-alias "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY_bfaf4e7b"}]
            (lib/returned-columns query)))))

(deftest ^:parallel join-strategy-test
  (let [query  lib.tu/query-with-join
        [join] (lib/joins query)]
    (testing "join without :strategy"
      (is (= :left-join
             (lib/raw-join-strategy join)))
      (is (= {:lib/type :option/join.strategy, :strategy :left-join, :default true}
             (lib/join-strategy join))))
    (testing "join with explicit :strategy"
      (let [join' (lib/with-join-strategy join :right-join)]
        (is (=? {:strategy :right-join}
                join'))
        (is (= :right-join
               (lib/raw-join-strategy join')))
        (is (= {:lib/type :option/join.strategy, :strategy :right-join}
               (lib/join-strategy join')))))))

(deftest ^:parallel with-join-strategy-test
  (are [strategy] (=? {:stages [{:joins [{:conditions [[:=
                                                        {}
                                                        [:field
                                                         {:join-alias absent-key-marker}
                                                         (meta/id :venues :category-id)]
                                                        [:field
                                                         {:join-alias "Categories"}
                                                         (meta/id :categories :id)]]]
                                          :strategy :right-join
                                          :alias "Categories"}]}]}
                      (-> lib.tu/venues-query
                          (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                                         [(lib/=
                                                           (meta/field-metadata :venues :category-id)
                                                           (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                        (lib/with-join-strategy strategy)))))
    :right-join
    {:lib/type :option/join.strategy, :strategy :right-join}))

(deftest ^:parallel available-join-strategies-test
  (is (= [{:lib/type :option/join.strategy, :strategy :left-join, :default true}
          {:lib/type :option/join.strategy, :strategy :right-join}
          {:lib/type :option/join.strategy, :strategy :inner-join}]
         (lib/available-join-strategies lib.tu/query-with-join))))

(deftest ^:parallel join-strategy-display-name-test
  (let [query lib.tu/query-with-join]
    (is (= ["Left outer join" "Right outer join" "Inner join"]
           (map (partial lib/display-name query)
                (lib/available-join-strategies query))))))

(deftest ^:parallel join-strategy-display-info-test
  (let [query lib.tu/query-with-join]
    (is (= [{:short-name "left-join", :display-name "Left outer join", :default true}
            {:short-name "right-join", :display-name "Right outer join"}
            {:short-name "inner-join", :display-name "Inner join"}]
           (map (partial lib/display-info query)
                (lib/available-join-strategies query))))))

(deftest ^:parallel with-join-alias-update-fields-test
  (testing "with-join-alias should update the alias of columns in :fields"
    (let [query  lib.tu/query-with-join-with-explicit-fields
          [join] (lib/joins query)]
      (is (=? {:alias  "Cat"
               :fields [[:field {:join-alias "Cat"} (meta/id :categories :name)]]}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:alias  "New Alias"
                 :fields [[:field {:join-alias "New Alias"} (meta/id :categories :name)]]}
                join'))))))

(deftest ^:parallel with-join-alias-update-condition-rhs-test
  (testing "with-join-alias should update the alias of the RHS column(s) in the condition(s)"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)]
      (is (=? {:conditions [[:= {}
                             [:field {} (meta/id :venues :category-id)]
                             [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
               :alias      "Cat"}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:conditions [[:= {}
                               [:field {} (meta/id :venues :category-id)]
                               [:field {:join-alias "New Alias"} (meta/id :categories :id)]]]
                 :alias      "New Alias"}
                join'))))))

(deftest ^:parallel with-join-alias-update-condition-rhs-set-alias-for-first-time-test
  (testing "with-join-alias should set the alias of the RHS column(s) when setting the alias for the first time"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)
          join   (-> join
                     (dissoc :alias)
                     (update :conditions (fn [conditions]
                                           (mapv (fn [[operator opts lhs rhs :as _condition]]
                                                   [operator opts lhs (lib/with-join-alias rhs nil)])
                                                 conditions))))]
      (is (=? {:conditions [[:= {}
                             [:field {} (meta/id :venues :category-id)]
                             [:field {:join-alias absent-key-marker} (meta/id :categories :id)]]]
               :alias      absent-key-marker}
              join))
      (let [join' (lib/with-join-alias join "New Alias")]
        (is (=? {:conditions [[:= {}
                               [:field {} (meta/id :venues :category-id)]
                               [:field {:join-alias "New Alias"} (meta/id :categories :id)]]]
                 :alias      "New Alias"}
                join'))))))

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
          [join] (lib/joins query)
          new-conditions [(lib/=
                           (meta/field-metadata :venues :id)
                           (-> (meta/field-metadata :categories :id)
                               (lib/with-join-alias "My Join")))]]
        (is (=? [[:= {}
                  [:field {} (meta/id :venues :id)]
                  [:field {:join-alias "My Join"} (meta/id :categories :id)]]]
                (lib/join-conditions (lib/with-join-conditions join new-conditions)))))))

(deftest ^:parallel with-join-conditions-join-has-no-alias-yet-test
  (testing "with-join-conditions should work if join doesn't yet have an alias"
    (let [query  lib.tu/query-with-join
          [join] (lib/joins query)
          join   (lib/with-join-alias join nil)]
      (is (nil? (lib.join.util/current-join-alias join)))
      (let [new-conditions [(lib/=
                             (meta/field-metadata :venues :id)
                             (meta/field-metadata :categories :id))]
            join' (lib/with-join-conditions join new-conditions)]
        (is (=? [[:= {}
                  [:field {} (meta/id :venues :id)]
                  [:field {:join-alias absent-key-marker} (meta/id :categories :id)]]]
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
                    [:field {:join-alias absent-key-marker}
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
                     [:field {:join-alias absent-key-marker} (meta/id :categories :id)]]
                    [:= {}
                     [:field {} (meta/id :venues :category-id)]
                     [:field {:join-alias absent-key-marker} (meta/id :categories :id)]]]]
                  conditions')))))))

(defn- test-with-join-fields [input expected]
  (testing (pr-str (list 'with-join-fields 'query input))
    (let [query (-> lib.tu/venues-query
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :categories)
                                   [(lib/=
                                     (meta/field-metadata :venues :category-id)
                                     (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                  (lib/with-join-alias "Cat")
                                  (lib/with-join-fields input))))]
      (is (=? {:stages [{:joins [(merge
                                  {:alias      "Cat"
                                   :conditions [[:= {}
                                                 [:field {} (meta/id :venues :category-id)]
                                                 [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}
                                  expected)]}]}
              query))
      (let [[join] (lib/joins query)]
        (is (some? join))
        (is (= (:fields expected)
               (lib/join-fields join)))))))

(deftest ^:parallel with-join-fields-test
  (doseq [{:keys [input expected]}
          [{:input :all, :expected {:fields :all}}
           {:input :none, :expected {:fields :none}}
           ;; (with-join-fields ... []) should set :fields to :none
           {:input [], :expected {:fields :none}}
           {:input nil, :expected {:fields :all}}]]
    (test-with-join-fields input expected)))

(deftest ^:parallel with-join-fields-explicit-fields-test
  (let [categories-id [:field {:lib/uuid   (str (random-uuid))
                               :join-alias "Cat"}
                       (meta/id :categories :id)]]
    (test-with-join-fields
     [categories-id]
     {:fields [categories-id]})))

(deftest ^:parallel with-join-fields-update-join-aliases-test
  (testing "explicit :fields should change join alias for fields that have a different alias (#32437)"
    (let [categories-id [:field {:lib/uuid (str (random-uuid))} (meta/id :categories :id)]]
      (test-with-join-fields
       [(lib/with-join-alias categories-id "Hat")]
       {:fields [(lib/with-join-alias categories-id "Cat")]}))))

(deftest ^:parallel with-join-fields-add-missing-aliases-test
  (testing "explicit :fields should add join alias to fields missing it (#32437)"
    (let [categories-id [:field {:lib/uuid (str (random-uuid))} (meta/id :categories :id)]]
      (test-with-join-fields
       [categories-id]
       {:fields [(lib/with-join-alias categories-id "Cat")]}))))

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
            [card-type card] {"Native" (:categories/native lib.tu/mock-cards)
                              "MBQL"   (:categories lib.tu/mock-cards)}]
      (testing (str "a " card-type " Card")
        (let [cols (lib/join-condition-rhs-columns query card nil nil)]
          (is (=? [{:display-name "ID", :lib/source :source/joins, :lib/card-id (:id card)}
                   {:display-name "Name", :lib/source :source/joins, :lib/card-id (:id card)}]
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
                          (:venues lib.tu/mock-cards)]]
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

(deftest ^:parallel join-alias-single-table-multiple-times-test
  (testing "joining the same table twice results in different join aliases"
    (is (=? [{:alias "Checkins"}
             {:alias "Checkins_2"}]
            (-> (lib/query meta/metadata-provider (meta/table-metadata :users))
                (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                               [(lib/=
                                                 (meta/field-metadata :users :id)
                                                 (meta/field-metadata :checkins :user-id))])))
                (lib/join (-> (lib/join-clause (meta/table-metadata :checkins)
                                               [(lib/=
                                                 (meta/field-metadata :users :id)
                                                 (meta/field-metadata :checkins :user-id))])))
                :stages first :joins)))))

(deftest ^:parallel suggested-join-conditions-test
  (testing "DO suggest a join condition for an FK -> PK relationship"
    (are [query] (=? [[:=
                       {}
                       [:field {} (meta/id :venues :category-id)]
                       [:field {} (meta/id :categories :id)]]]
                     (lib/suggested-join-conditions
                      query
                      (meta/table-metadata :categories)))
      ;; plain query
      lib.tu/venues-query

      ;; query with an aggregation (FK column is not exported, but is still "visible")
      (-> lib.tu/venues-query
          (lib/aggregate (lib/count))))))

(deftest ^:parallel suggested-join-conditions-pk->fk-test
  ;; this is to preserve the existing behavior from MLv1, it doesn't necessarily make sense, but we don't want to have
  ;; to update a million tests, right? Once v1-compatible joins lands then maybe we can go in and make this work,
  ;; since it seems like it SHOULD work.
  (testing "DO suggest join conditions for a PK -> FK relationship"
    (is (=? [[:=
              {}
              [:field {} (meta/id :categories :id)]
              [:field {} (meta/id :venues :category-id)]]]
            (lib/suggested-join-conditions
             (lib/query meta/metadata-provider (meta/table-metadata :categories))
             (meta/table-metadata :venues))))))

(deftest ^:parallel suggested-join-conditions-fk-from-join-test
  (testing "DO suggest join conditions for a FK -> PK relationship if the FK comes from a join"
    (is (=? [[:=
              {}
              [:field {:join-alias "Venues"} (meta/id :venues :category-id)]
              [:field {} (meta/id :categories :id)]]]
            (lib/suggested-join-conditions
             (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                 (lib/join (-> (lib/join-clause
                                (meta/table-metadata :venues)
                                [(lib/= (meta/field-metadata :checkins :venue-id)
                                        (-> (meta/field-metadata :venues :id)
                                            (lib/with-join-alias "Venues")))])
                               (lib/with-join-alias "Venues"))))
             (meta/table-metadata :categories))))))

(deftest ^:parallel suggested-join-conditions-fk-from-implicitly-joinable-test
  (testing "DON'T suggest join conditions for a FK -> implicitly joinable PK relationship (#34526)"
    (let [orders (meta/table-metadata :orders)
          card-query (as-> (lib/query meta/metadata-provider orders) q
                       (lib/breakout q (m/find-first #(= (:id %) (meta/id :orders :user-id))
                                                     (lib/returned-columns q)))
                       (lib/aggregate q (lib/count)))
          metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:cards [{:id            1
                                       :name          "Q1"
                                       :database-id   (meta/id)
                                       :dataset-query (lib/query meta/metadata-provider card-query)
                                       :fields        (lib/returned-columns card-query)}]})
          card (lib.metadata/card metadata-provider 1)
          query (lib/query metadata-provider orders)]
      (is (nil? (lib/suggested-join-conditions query card))))))

(deftest ^:parallel suggested-join-condition-for-fks-pointing-to-non-pk-columns
  (testing (str "We should be able to suggest a join condition if any column in the current table is an FK pointing "
                "to the target, regardless of whether that column is marked as a PK or not")
    (let [id-user           1
          id-order          2
          id-user-id        10
          id-order-user-id  20
          metadata-provider (lib.tu/mock-metadata-provider
                             {:database meta/database
                              :tables   [{:id   id-user
                                          :name "user"}
                                         {:id   id-order
                                          :name "order"}]
                              :fields   [{:id        id-user-id
                                          :table-id  id-user
                                          :name      "id"
                                          :base-type :type/Integer}
                                         {:id                 id-order-user-id
                                          :table-id           id-order
                                          :name               "user_id"
                                          :base-type          :type/Integer
                                          :semantic-type      :type/FK
                                          :fk-target-field-id id-user-id}]})
          order             (lib.metadata/table metadata-provider id-order)
          user              (lib.metadata/table metadata-provider id-user)]
      (testing "ORDER joining USER (we have an FK to the joined thing)"
        (let [query (lib/query metadata-provider order)]
          (is (=? [[:= {}
                    [:field {} id-order-user-id]
                    [:field {} id-user-id]]]
                  (lib/suggested-join-conditions query user)))))
      (testing "USER joining ORDER (joined thing has an FK to us)"
        (let [query (lib/query metadata-provider user)]
          (is (=? [[:= {}
                    [:field {} id-user-id]
                    [:field {} id-order-user-id]]]
                  (lib/suggested-join-conditions query order))))))))

(deftest ^:parallel suggested-join-conditions-multiple-fks-to-same-column-test
  (testing "when there are multiple FKs to a table, but they point to the same column, only suggest one or the other"
    (let [id-user                 1
          id-message              2
          id-user-id              10
          id-message-sender-id    20
          id-message-recipient-id 21
          metadata-provider       (lib.tu/mock-metadata-provider
                                   {:database meta/database
                                    :tables   [{:id   id-user
                                                :name "user"}
                                               {:id   id-message
                                                :name "message"}]
                                    :fields   [{:id            id-user-id
                                                :table-id      id-user
                                                :name          "id"
                                                :base-type     :type/Integer
                                                :semantic-type :type/PK}
                                               {:id                 id-message-sender-id
                                                :table-id           id-message
                                                :name               "sender_id"
                                                :base-type          :type/Integer
                                                :semantic-type      :type/FK
                                                :fk-target-field-id id-user-id}
                                               {:id                 id-message-recipient-id
                                                :table-id           id-message
                                                :name               "recipient_id"
                                                :base-type          :type/Integer
                                                :semantic-type      :type/FK
                                                :fk-target-field-id id-user-id}]})
          message                 (lib.metadata/table metadata-provider id-message)
          user                    (lib.metadata/table metadata-provider id-user)]
      (testing "MESSAGE joining USER (we have 2 FKs to the joined thing)"
        (let [query (lib/query metadata-provider message)]
          (is (=? [[:= {}
                    ;; doesn't particularly matter which one gets picked, and order is not necessarily determinate
                    [:field {} #(contains? #{id-message-sender-id id-message-recipient-id} %)]
                    [:field {} id-user-id]]]
                  (lib/suggested-join-conditions query user)))))
      (testing "USER joining MESSAGE (joined thing has 2 FKs to us)"
        (let [query (lib/query metadata-provider user)]
          (is (=? [[:= {}
                    [:field {} id-user-id]
                    [:field {} #(contains? #{id-message-sender-id id-message-recipient-id} %)]]]
                  (lib/suggested-join-conditions query message))))))))

(deftest ^:parallel suggested-join-conditions-transitive-fks-test
  (testing "Implicitly joinable fields are ignored during suggested-joins-condition computation (#41202)"
    (let [account-tab-id 10
          organization-tab-id 20
          contact-tab-id 30
          account-f-id 100
          organization-f-id 110
          organization-f-account-id 120
          contact-f-organization-id 130
          account-card-id 1000
          contact-card-id 1100
          metadata-provider (lib.tu/mock-metadata-provider
                             {:database meta/database
                              :tables   [{:id   account-tab-id
                                          :name "account"}
                                         {:id   organization-tab-id
                                          :name "organization"}
                                         {:id   contact-tab-id
                                          :name "contact"}]
                              :fields   [{:id account-f-id
                                          :name "account__id"
                                          :table-id account-tab-id
                                          :base-type :type/Integer}
                                         {:id organization-f-id
                                          :name "organization__id"
                                          :table-id organization-tab-id
                                          :base-type :type/Integer}
                                         {:id organization-f-account-id
                                          :name "organization__account_id"
                                          :table-id organization-tab-id
                                          :base-type :type/Integer
                                          :semantic-type :type/FK
                                          :fk-target-field-id account-f-id}
                                         {:id contact-f-organization-id
                                          :name "contact__organization_id"
                                          :table-id contact-tab-id
                                          :base-type :type/Integer
                                          :semantic-type :type/FK
                                          :fk-target-field-id organization-f-id}]
                              :cards [{:id account-card-id
                                       :name "Account Model"
                                       :type :model
                                       :lib/type :metadata/card
                                       :database-id (:id meta/database)
                                       :result-metadata [{:id account-f-id
                                                          :name "account__id"
                                                          :table-id account-tab-id
                                                          :base-type :type/Integer}]
                                       :dataset-query {:lib/type :mbql.stage/mbql
                                                       :database (:id meta/database)
                                                       :source-table account-tab-id}}
                                      {:id contact-card-id
                                       :name "Contact Model"
                                       :type :model
                                       :lib/type :metadata/card
                                       :database-id (:id meta/database)
                                       :result-metadata [{:id contact-f-organization-id
                                                          :name "contact__organization_id"
                                                          :table-id contact-tab-id
                                                          :base-type :type/Integer
                                                          :semantic-type :type/FK
                                                          :fk-target-field-id organization-f-id}]
                                       :dataset-query {:lib/type :mbql.stage/mbql
                                                       :database (:id meta/database)
                                                       :source-table contact-tab-id}}]})
          account-card (lib.metadata/card metadata-provider account-card-id)
          contact-card (lib.metadata/card metadata-provider contact-card-id)
          query (lib/query metadata-provider account-card)]
      (is (nil? (lib.join/suggested-join-conditions query contact-card))))))

(deftest ^:parallel suggested-join-conditions-multiple-fks-to-different-columns-test
  (testing "when there are multiple FKs to a table, and they point to different columns, suggest multiple join conditions (#34184)"
    ;; let's pretend we live in crazy land and the PK for USER is ID + EMAIL (a composite PK) and ORDER has USER_ID
    ;; and USER_EMAIL
    (let [id-user             1
          id-order            2
          id-user-id          10
          id-user-email       11
          id-order-user-id    20
          id-order-user-email 21
          metadata-provider   (lib.tu/mock-metadata-provider
                               {:database meta/database
                                :tables   [{:id   id-user
                                            :name "user"}
                                           {:id   id-order
                                            :name "order"}]
                                :fields   [{:id        id-user-id
                                            :table-id  id-user
                                            :name      "id"
                                            :base-type :type/Integer}
                                           {:id        id-user-email
                                            :table-id  id-user
                                            :name      "email"
                                            :base-type :type/Text}
                                           {:id                 id-order-user-id
                                            :table-id           id-order
                                            :name               "user_id"
                                            :base-type          :type/Integer
                                            :semantic-type      :type/FK
                                            :fk-target-field-id id-user-id}
                                           {:id                 id-order-user-email
                                            :table-id           id-order
                                            :name               "user_email"
                                            :base-type          :type/Text
                                            :semantic-type      :type/FK
                                            :fk-target-field-id id-user-email}]})
          order               (lib.metadata/table metadata-provider id-order)
          user                (lib.metadata/table metadata-provider id-user)
          ;; the order the conditions get returned in is indeterminate, so for convenience let's just sort them by
          ;; Field IDs so we get consistent results in the test assertions.
          sort-conditions     #(sort-by (fn [[_= _opts [_field _opts lhs-id, :as _lhs] [_field _opts rhs-id, :as _rhs]]]
                                          [lhs-id rhs-id])
                                        %)]
      (testing "ORDER joining USER (we have a composite FK to the joined thing)"
        (let [query (lib/query metadata-provider order)]
          (is (=? [[:= {}
                    [:field {} id-order-user-id]
                    [:field {} id-user-id]]
                   [:= {}
                    [:field {} id-order-user-email]
                    [:field {} id-user-email]]]
                  (sort-conditions (lib/suggested-join-conditions query user))))))
      (testing "USER joining ORDER (joined thing has a composite FK to us)"
        (let [query (lib/query metadata-provider user)]
          (is (=? [[:= {}
                    [:field {} id-user-id]
                    [:field {} id-order-user-id]]
                   [:= {}
                    [:field {} id-user-email]
                    [:field {} id-order-user-email]]]
                  (sort-conditions (lib/suggested-join-conditions query order)))))))))

(deftest ^:parallel join-conditions-test
  (let [joins (lib/joins lib.tu/query-with-join)]
    (is (= 1
           (count joins)))
    (is (=? [[:=
              {}
              [:field {} (meta/id :venues :category-id)]
              [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
            (lib/join-conditions (first joins))))))

(deftest ^:parallel joinable-columns-test
  (are [table-or-card] (=? [{:lib/type :metadata/column, :name "ID"}
                            {:lib/type :metadata/column, :name "NAME"}
                            {:lib/type :metadata/column, :name "CATEGORY_ID"}
                            {:lib/type :metadata/column, :name "LATITUDE"}
                            {:lib/type :metadata/column, :name "LONGITUDE"}
                            {:lib/type :metadata/column, :name "PRICE"}]
                           (lib/joinable-columns lib.tu/venues-query -1 table-or-card))
    (meta/table-metadata :venues)
    (:venues lib.tu/mock-cards)))

(deftest ^:parallel joinable-columns-join-test
  (let [query           lib.tu/query-with-join
        [original-join] (lib/joins query)]
    (is (=? {:lib/type :mbql/join, :alias "Cat", :fields :all}
            original-join))
    (doseq [{:keys [fields id-selected? name-selected?]} [{:fields         :all
                                                           :id-selected?   true
                                                           :name-selected? true}
                                                          {:fields         :none
                                                           :id-selected?   false
                                                           :name-selected? false}
                                                          {:fields         nil
                                                           :id-selected?   false
                                                           :name-selected? false}
                                                          {:fields         [[:field {:lib/uuid   (str (random-uuid))
                                                                                     :join-alias "Cat"}
                                                                             (meta/id :categories :id)]]
                                                           :id-selected?   true
                                                           :name-selected? false}]]
      (testing (str "fields = " (pr-str fields))
        (let [join  (lib/with-join-fields original-join fields)
              ;; FIXME -- joins replacement broken -- #32026
              ;; query (lib/replace-clause query original-join join)
              query (assoc-in query [:stages 0 :joins] [join])
              cols  (lib/joinable-columns query -1 join)]
          (is (=? [{:name                         "ID"
                    :metabase.lib.join/join-alias "Cat"
                    :source-alias                 "Cat"
                    :lib/source                   :source/joins
                    :lib/source-column-alias      "ID"
                    :lib/desired-column-alias     "Cat__ID"
                    :selected?                    id-selected?}
                   {:name                         "NAME"
                    :metabase.lib.join/join-alias "Cat"
                    :source-alias                 "Cat"
                    :lib/source                   :source/joins
                    :lib/source-column-alias      "NAME"
                    :lib/desired-column-alias     "Cat__NAME"
                    :selected?                    name-selected?}]
                  cols))
          (testing `lib/display-info
            (is (=? [{:display-name "ID", :long-display-name "Cat → ID", :selected id-selected?}
                     {:display-name "Name", :long-display-name "Cat → Name", :selected name-selected?}]
                    (map (partial lib/display-info query) cols))))
          (testing `lib/with-join-fields
            (is (=? {:lib/type :mbql/join
                     ;; TODO -- these should probably be using string names rather than integer IDs, see #29763. Okay for
                     ;; now since the QP will do the right thing.
                     :fields   [[:field
                                 {:lib/uuid string?, :join-alias "Cat"}
                                 (meta/id :categories :id)]
                                [:field
                                 {:lib/uuid string?, :join-alias "Cat"}
                                 (meta/id :categories :name)]]}
                    (lib/with-join-fields join cols)))))))))

(deftest ^:parallel join-lhs-display-name-test
  (doseq [[source-table? query]                {true  lib.tu/venues-query
                                                false lib.tu/query-with-source-card}
          [num-existing-joins query]           {0 query
                                                1 (lib.tu/add-joins query "J1")
                                                2 (lib.tu/add-joins query "J1" "J2")}
          [first-join? join? join-or-joinable] (list*
                                                [(zero? num-existing-joins) false (meta/table-metadata :venues)]
                                                [(zero? num-existing-joins) false (:venues lib.tu/mock-cards)]
                                                [(zero? num-existing-joins) false nil]
                                                (when-let [[first-join & more] (not-empty (lib/joins query))]
                                                  (cons [true true first-join]
                                                        (for [join more]
                                                          [false true join]))))
          [num-stages query]                   {1 query
                                                2 (lib/append-stage query)}]
    (testing (str "query w/ source table?" source-table?                                              \newline
                  "num-existing-joins = "  num-existing-joins                                         \newline
                  "num-stages = "          num-stages                                                 \newline
                  "join =\n"               (u/pprint-to-str join-or-joinable)                         \newline
                  "existing joins = "      (u/pprint-to-str (map lib.options/uuid (lib/joins query))) \newline
                  "first join? "           first-join?)
      (testing "When passing an explicit LHS column, use display name for its `:table`"
        (is (= "Orders"
               (lib/join-lhs-display-name query join-or-joinable (meta/field-metadata :orders :product-id)))))
      (testing "existing join should use the display name for condition LHS"
        (when join?
          (is (= "Venues"
                 (lib/join-lhs-display-name query join-or-joinable)))))
      (testing "The first join should use the display name of the query `:source-table` without explicit LHS"
        (when (and source-table?
                   (= num-stages 1)
                   first-join?)
          (is (= "Venues"
                 (lib/join-lhs-display-name query join-or-joinable)))))
      (testing "When *building* a join that is not the first join, if query does not use `:source-table`, use 'Previous results'"
        (when (and (not join?)
                   (or (not source-table?)
                       (not first-join?)
                       (> num-stages 1)))
          (is (= "Previous results"
                 (lib/join-lhs-display-name query join-or-joinable))))))))

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

(deftest ^:parallel default-join-alias-test
  (testing "default join-alias set without overwriting other aliases (#32897)"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :checkins)
                                   [(lib/= (meta/field-metadata :venues :id)
                                           (-> (meta/field-metadata :checkins :venue-id)
                                               (lib/with-join-alias "Checkins")))])
                                  (lib/with-join-fields :all)
                                  (lib/with-join-alias "Checkins")))
                    (lib/join (-> (lib/join-clause
                                   (meta/table-metadata :users)
                                   [(lib/= (-> (meta/field-metadata :checkins :user-id)
                                               (lib/with-join-alias "Checkins"))
                                           (meta/field-metadata :users :id))])
                                  (lib/with-join-fields :all))))]
      (is (=? [{:lib/type :mbql/join,
                :stages [{:lib/type :mbql.stage/mbql
                          :source-table (meta/id :checkins)}]
                :fields :all
                :conditions [[:=
                              {}
                              [:field {:join-alias absent-key-marker} (meta/id :venues :id)]
                              [:field {:join-alias "Checkins"} (meta/id :checkins :venue-id)]]]
                :alias "Checkins"}
               {:lib/type :mbql/join
                :stages [{:lib/type :mbql.stage/mbql
                          :source-table (meta/id :users)}]
                :fields :all,
                :conditions [[:=
                              {}
                              [:field {:join-alias "Checkins"} (meta/id :checkins :user-id)]
                              [:field {:join-alias "Users"} (meta/id :users :id)]]],
                :alias "Users"}]
              (lib/joins query))))))

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
                       (lib/join-condition-rhs-columns query join lhs rhs))))))
      (testing "temporal bucket returns with column metadata"
        (let [[lhs-column] (filter :selected? (lib/join-condition-lhs-columns query 0 join lhs rhs))]
          (is (= {:lib/type :option/temporal-bucketing, :unit :month} (lib/temporal-bucket lhs-column))))
        (let [[rhs-column] (filter :selected? (lib/join-condition-rhs-columns query 0 join lhs rhs))]
          (is (= {:lib/type :option/temporal-bucketing, :unit :month} (lib/temporal-bucket rhs-column))))))))

(deftest ^:parallel join-a-table-test
  (testing "As a convenience, we should support calling `join` with a Table metadata and do the right thing automatically"
    (is (=? {:stages [{:source-table (meta/id :orders)
                       :joins        [{:stages     [{:source-table (meta/id :products)}]
                                       :fields     :all
                                       :alias      "Products"
                                       :conditions [[:=
                                                     {}
                                                     [:field {} (meta/id :orders :product-id)]
                                                     [:field {:join-alias "Products"} (meta/id :products :id)]]]}]}]}
            (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                (lib/join (meta/table-metadata :products)))))
    (testing "with reverse PK <- FK relationship"
      (is (=? {:stages [{:source-table (meta/id :products)
                         :joins        [{:stages     [{:source-table (meta/id :orders)}]
                                         :fields     :all
                                         :alias      "Orders"
                                         :conditions [[:=
                                                       {}
                                                       [:field {} (meta/id :products :id)]
                                                       [:field {:join-alias "Orders"} (meta/id :orders :product-id)]]]}]}]}
              (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                  (lib/join (meta/table-metadata :orders))))))))

(deftest ^:parallel join-source-card-with-in-previous-stage-with-joins-test
  (testing "Make sure we generate correct join conditions when joining source cards with joins (#31769)"
    (doseq [broken-refs? [true false]]
      (testing (str "\nbroken-refs? = " (pr-str broken-refs?))
        (binding [lib.card/*force-broken-card-refs* broken-refs?]
          (is (=? {:stages [{:source-card 1}
                            {:joins [{:stages     [{:source-card 2}]
                                      :fields     :all
                                      :conditions [[:=
                                                    {}
                                                    (if broken-refs?
                                                      [:field {} (meta/id :products :category)]
                                                      [:field {:base-type :type/Text} "Products__CATEGORY"])
                                                    [:field {:join-alias "Card 2 - Category"} (meta/id :products :category)]]]
                                      :alias      "Card 2 - Category"}]
                             :limit 2}]}
                  (lib.tu.mocks-31769/query))))))))

(deftest ^:parallel suggested-name-include-joins-test
  (testing "Include the names of joined tables in suggested query names (#24703)"
    (is (= "Venues + Categories"
           (lib/suggested-name lib.tu/query-with-join)))))

(deftest ^:parallel suggested-join-conditions-with-position-test
  (testing "when editing the _i_th join, columns from that and later joins should not be suggested"
    ;; We want a case where the existing join contains an FK for the new RHS table, but the original table doesn't.
    ;; Products + Orders works for this: Orders.USER_ID is an FK to People.ID, but Products has no such link.
    (let [products->orders  (lib/join-clause (meta/table-metadata :orders)
                                             [(lib/= (meta/field-metadata :products :id)
                                                     (meta/field-metadata :orders :product-id))])
          products->reviews (lib/join-clause (meta/table-metadata :reviews)
                                             [(lib/= (meta/field-metadata :products :id)
                                                     (meta/field-metadata :reviews :product-id))])]
      (testing "Products + Orders"
        (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                        (lib/join products->orders))]
          (testing "for a new join (no position), Orders.USER_ID is suggested for joining People"
            (is (=? [[:= {}
                      [:field {:join-alias "Orders"} (meta/id :orders :user-id)]
                      [:field {}                     (meta/id :people :id)]]]
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people)))))
          (testing "but when editing that join, Orders.USER_ID is not visible and no condition is suggested"
            (is (=? nil
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people) 0))))))
      (testing "Products + Reviews + Orders"
        (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                        (lib/join products->reviews)
                        (lib/join products->orders))]
          (testing "for a new join (no position), Orders.USER_ID is suggested for joining People"
            (is (=? [[:= {}
                      [:field {:join-alias "Orders"} (meta/id :orders :user-id)]
                      [:field {}                     (meta/id :people :id)]]]
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people)))))
          (testing "but when editing *either* join, Orders.USER_ID is not visible and no condition is suggested"
            (doseq [position [0 1]]
              (is (=? nil
                      (lib/suggested-join-conditions query -1 (meta/table-metadata :people) position)))))))
      (testing "Products + Orders + Reviews"
        (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                        (lib/join products->orders)
                        (lib/join products->reviews))]
          (testing "for a new join (no position), Orders.USER_ID is suggested for joining People"
            (is (=? [[:= {}
                      [:field {:join-alias "Orders"} (meta/id :orders :user-id)]
                      [:field {}                     (meta/id :people :id)]]]
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people)))))
          (testing "when editing the second join, the first join's keys are still available"
            (is (=? [[:= {}
                      [:field {:join-alias "Orders"} (meta/id :orders :user-id)]
                      [:field {}                     (meta/id :people :id)]]]
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people) 1))))
          (testing "but when editing the first join, Orders.USER_ID is not visible and no condition is suggested"
            (is (=? nil
                    (lib/suggested-join-conditions query -1 (meta/table-metadata :people) 0)))))))))
