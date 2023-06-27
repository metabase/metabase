(ns metabase.lib.join-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider :as lib.metadata.composed-provider]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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
                                                        :join-alias (symbol "nil #_\"key is not present.\"")}
                                                       (meta/id :venues :category-id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias "Categories"}
                                                       (meta/id :categories :id)]]]}]}]}
          (let [q (lib/query meta/metadata-provider (meta/table-metadata :venues))
                j (lib/query meta/metadata-provider (meta/table-metadata :categories))]
            (lib/join q (lib/join-clause j [{:lib/type :lib/external-op
                                             :operator :=
                                             :args     [(lib/ref (lib.metadata/field q nil "VENUES" "CATEGORY_ID"))
                                                        (lib/ref (lib.metadata/field j nil "CATEGORIES" "ID"))]}]))))))

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
                                                        :join-alias "Venues"}
                                                       (meta/id :venues :category-id)]
                                                      [:field
                                                       {:lib/uuid string?
                                                        :join-alias (symbol "nil #_\"key is not present.\"")}
                                                       (meta/id :categories :id)]]]}]}]}
          (-> (lib/query meta/metadata-provider (meta/table-metadata :categories))
              (lib/join (lib/join-clause
                         (lib/saved-question-query meta/metadata-provider meta/saved-question)
                         [(lib/= (meta/field-metadata :venues :category-id)
                                 (meta/field-metadata :categories :id))]))
              (dissoc :lib/metadata)))))

(deftest ^:parallel join-condition-field-metadata-test
  (testing "Should be able to use raw Field metadatas in the join condition"
    (let [q1                          (lib/query meta/metadata-provider (meta/table-metadata :categories))
          q2                          (lib/saved-question-query meta/metadata-provider meta/saved-question)
          venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
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
              (lib.metadata.calculation/metadata query -1 query))))))

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
                 :lib/metadata meta/metadata-provider}]
      (let [metadata (lib.metadata.calculation/metadata query)]
        (is (=? [(merge (meta/field-metadata :categories :name)
                        {:display-name         "Name"
                         :lib/source           :source/fields
                         ::lib.join/join-alias "CATEGORIES__via__CATEGORY_ID"})]
                metadata))
        (is (=? "CATEGORIES__via__CATEGORY_ID"
                (lib.join/current-join-alias (first metadata))))
        (is (=? [:field
                 {:lib/uuid string?, :join-alias "CATEGORIES__via__CATEGORY_ID"}
                 (meta/id :categories :name)]
                (lib/ref (first metadata))))))))

(deftest ^:parallel join-against-source-card-metadata-test
  (let [card-1            {:name          "My Card"
                           :id            1
                           :dataset-query {:database (meta/id)
                                           :type     :query
                                           :query    {:source-table (meta/id :checkins)
                                                      :aggregation  [[:count]]
                                                      :breakout     [[:field (meta/id :checkins :user-id) nil]]}}}
        metadata-provider (lib.metadata.composed-provider/composed-metadata-provider
                           meta/metadata-provider
                           (lib.tu/mock-metadata-provider
                            {:cards [card-1]}))
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
              :lib/desired-column-alias "USER_ID"}
             {:name                     "count"
              :lib/source               :source/joins
              :lib/source-column-alias  "count"
              :lib/desired-column-alias "count"}]
            (lib.metadata.calculation/metadata query -1 join)))))

(deftest ^:parallel joins-source-and-desired-aliases-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
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
            (lib.metadata.calculation/metadata query)))
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
                 (lib.metadata.calculation/metadata query))))
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
                (lib.metadata.calculation/metadata query')))))))

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
            (lib.metadata.calculation/metadata query)))))

(deftest ^:parallel join-strategy-test
  (let [query  (lib.tu/query-with-join)
        [join] (lib/joins query)]
    (testing "join without :strategy"
      (is (= :left-join
             (lib/join-strategy join))))
    (testing "join with explicit :strategy"
      (let [join' (lib/with-join-strategy join :right-join)]
        (is (=? {:strategy :right-join}
                join'))
        (is (= :right-join
               (lib/join-strategy join')))))))

(deftest ^:parallel with-join-strategy-test
  (testing "Make sure `with-join-alias` works with unresolved functions"
    (is (=? {:stages [{:joins [{:conditions [[:=
                                              {}
                                              [:field
                                               {:join-alias (symbol "nil #_\"key is not present.\"")}
                                               (meta/id :venues :category-id)]
                                              [:field
                                               {:join-alias "Categories"}
                                               (meta/id :categories :id)]]],
                                :strategy :right-join,
                                :alias "Categories"}]}]}
            (-> lib.tu/venues-query
                (lib/join (-> (lib/join-clause (meta/table-metadata :categories)
                                               [(lib/=
                                                 (meta/field-metadata :venues :category-id)
                                                 (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                              (lib/with-join-strategy :right-join))))))))

(deftest ^:parallel available-join-strategies-test
  (is (= [:left-join :right-join :inner-join]
         (lib/available-join-strategies (lib.tu/query-with-join)))))

(deftest ^:parallel with-join-fields-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/join (-> (lib/join-clause
                                 (meta/table-metadata :categories)
                                 [(lib/=
                                   (meta/field-metadata :venues :category-id)
                                   (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                                (lib/with-join-alias "Cat")
                                (lib/with-join-fields :all))))]
    (is (=? {:stages [{:joins [{:alias      "Cat"
                                :fields     :all
                                :conditions [[:= {}
                                              [:field {} (meta/id :venues :category-id)]
                                              [:field {:join-alias "Cat"} (meta/id :categories :id)]]]}]}]}
            query))))

(defn- query-with-join-with-fields
  "A query against `VENUES` joining `CATEGORIES` with `:fields` set to return only `NAME`."
  []
  (-> lib.tu/venues-query
      (lib/join (-> (lib/join-clause
                     (meta/table-metadata :categories)
                     [(lib/=
                       (meta/field-metadata :venues :category-id)
                       (lib/with-join-alias (meta/field-metadata :categories :id) "Cat"))])
                    (lib/with-join-alias "Cat")
                    (lib/with-join-fields [(lib/with-join-alias (meta/field-metadata :categories :name) "Cat")])))))

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
                (lib/join-condition-lhs-columns query rhs)))))))

(deftest ^:parallel join-condition-lhs-columns-with-previous-join-test
  (testing "Include columns from previous join(s)"
    (let [query (query-with-join-with-fields)]
      (doseq [rhs [nil (lib/with-join-alias (lib.metadata/field query (meta/id :users :id)) "User")]]
        (testing (str "rhs = " (pr-str rhs))
          (is (=? [{:lib/desired-column-alias "ID"}
                   {:lib/desired-column-alias "Cat__ID"} ;; FIXME #31233
                   {:lib/desired-column-alias "CATEGORY_ID"}
                   {:lib/desired-column-alias "NAME"}
                   {:lib/desired-column-alias "LATITUDE"}
                   {:lib/desired-column-alias "LONGITUDE"}
                   {:lib/desired-column-alias "PRICE"}
                   {:lib/desired-column-alias "Cat__NAME"}]
                  (lib/join-condition-lhs-columns query rhs)))
          (is (= (lib/join-condition-lhs-columns query rhs)
                 (lib/join-condition-lhs-columns query -1 rhs))))))))

(deftest ^:parallel join-condition-rhs-columns-test
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
                (map #(select-keys % [:lib/desired-column-alias])
                     (lib/join-condition-rhs-columns query joined-thing lhs))))))))

(deftest ^:parallel join-condition-operators-test
  ;; just make sure that this doesn't barf and returns the expected output given any combination of LHS or RHS fields
  ;; for now until we actually implement filtering there
  (let [query lib.tu/venues-query]
    (doseq [lhs [nil (lib.metadata/field query (meta/id :categories :id))]
            rhs [nil (lib.metadata/field query (meta/id :venues :category-id))]]
      (testing (pr-str (list `lib/join-condition-operators `lib.tu/venues-query lhs rhs))
        (is (=? [{:short :=}
                 {:short :>}
                 {:short :<}
                 {:short :>=}
                 {:short :<=}
                 {:short :!=}]
                (lib/join-condition-operators lib.tu/venues-query lhs rhs)))
        (is (= (lib/join-condition-operators lib.tu/venues-query lhs rhs)
               (lib/join-condition-operators lib.tu/venues-query -1 lhs rhs)))))))

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
      (lib/query meta/metadata-provider (meta/table-metadata :venues))

      ;; query with an aggregation (FK column is not exported, but is still "visible")
      (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
          (lib/aggregate (lib/count))))))

(deftest ^:parallel suggested-join-condition-pk->fk-test
  ;; this is to preserve the existing behavior from MLv1, it doesn't necessarily make sense, but we don't want to have
  ;; to update a million tests, right? Once v1-compatible joins lands then maybe we can go in and make this work,
  ;; since it seems like it SHOULD work.
  (testing "Don't suggest join conditions for a PK -> FK relationship"
    (is (nil?
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
  (let [joins (lib/joins (lib.tu/query-with-join))]
    (is (= 1
           (count joins)))
    (is (=? [[:=
              {}
              [:field {} (meta/id :venues :category-id)]
              [:field {:join-alias "Cat"} (meta/id :categories :id)]]]
            (lib/join-conditions (first joins))))))
