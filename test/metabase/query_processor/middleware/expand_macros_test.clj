(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]))

(defn- expand-macros
  "Upgrade `query` to MBQL 5 with the metadata provider in the QP store (if there is one) and call
  [[expand-macros/expand-macros]]."
  [query]
  (let [metadata-provider (if (qp.store/initialized?)
                            (qp.store/metadata-provider)
                            meta/metadata-provider)]
    (#'expand-macros/expand-macros (lib.query/query metadata-provider query))))

(deftest ^:parallel basic-expansion-test
  (testing "no Segment should yield exact same query"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/filter (lib/> (meta/field-metadata :venues :price) 1))
                    (lib/breakout (meta/field-metadata :venues :category-id)))]
      (is (= query
             (expand-macros query))))))

(def ^:private mock-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:segments [{:id         1
                :name       "Segment 1"
                :table-id   (meta/id :venues)
                :definition (-> (lib.query/query meta/metadata-provider (meta/table-metadata :venues))
                                (lib/filter (lib/= (meta/field-metadata :venues :name) "abc")))}
               {:id         2
                :name       "Segment 2"
                :table-id   (meta/id :venues)
                :definition (-> (lib.query/query meta/metadata-provider (meta/table-metadata :venues))
                                (lib/filter (lib/is-null (meta/field-metadata :venues :category-id))))}]}))

(deftest ^:parallel segments-test
  (qp.store/with-metadata-provider mock-metadata-provider
    (is (=? {:stages [{:source-table (meta/id :venues)
                       :breakout     [[:field {} (meta/id :venues :category-id)]]
                       :filters      [[:= {} [:field {:base-type :type/Text} (meta/id :venues :name)] "abc"]
                                      [:or {}
                                       [:is-null {} [:field {:base-type :type/Integer} (meta/id :venues :category-id)]]
                                       [:> {} [:field {} (meta/id :venues :price)] 1]]]}]}
            (expand-macros
             (lib.tu.macros/mbql-query venues
               {:filter   [:and
                           [:segment 1]
                           [:or
                            [:segment 2]
                            [:> $price 1]]]
                :breakout [$category-id]}))))))

(deftest ^:parallel nested-segments-test
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           mock-metadata-provider
                           {:segments [{:id         2
                                        :name       "Segment 2"
                                        :table-id   (meta/id :venues)
                                        :definition (let [segment-1 (lib.metadata/segment mock-metadata-provider 1)]
                                                      (-> (lib.query/query mock-metadata-provider (meta/table-metadata :venues))
                                                          (lib/filter (lib.filter/and
                                                                       segment-1
                                                                       (lib/> (meta/field-metadata :venues :price) 1)))))}]})]
    (qp.store/with-metadata-provider metadata-provider
      (testing "Nested segments are correctly expanded (#30866)"
        (is (=? {:stages [{:source-table (meta/id :venues)
                           :filters      [[:= {} [:field {:base-type :type/Text} (meta/id :venues :name)] "abc"]
                                          [:> {} [:field {:base-type :type/Integer} (meta/id :venues :price)] 1]]}]}
                (expand-macros
                 (lib.tu.macros/mbql-query venues
                   {:filter [:segment 2]}))))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (let [metadata-provider' (lib.tu/mock-metadata-provider
                              metadata-provider
                              {:segments [(let [segment-2 (lib.metadata/segment metadata-provider 2)]
                                            (assoc (lib.metadata/segment metadata-provider 1)
                                                   :definition
                                                   (-> (lib.query/query metadata-provider (meta/table-metadata :venues))
                                                       (lib/filter (lib.filter/and
                                                                    (lib/< (meta/field-metadata :venues :price) 3)
                                                                    segment-2)))))]})]
      (qp.store/with-metadata-provider metadata-provider'
        (testing "Expansion of mutually recursive segments causes an exception"
          (is (thrown-with-msg?
               Exception
               #"\QSegment expansion failed. Check mutually recursive segment definitions.\E"
               (expand-macros
                (lib.tu.macros/mbql-query venues {:filter [:segment 2]})))))))))

(deftest ^:parallel segments-in-share-clauses-test
  (testing "segments in :share clauses"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (=? {:stages [{:source-table (meta/id :venues)
                         :aggregation  [[:share {}
                                         [:and {}
                                          [:= {} [:field {:base-type :type/Text} (meta/id :venues :name)] "abc"]
                                          [:or {}
                                           [:is-null {} [:field {:base-type :type/Integer} (meta/id :venues :category-id)]]
                                           [:> {} [:field {} (meta/id :venues :price)] 1]]]]]}]}
              (expand-macros
               (lib.tu.macros/mbql-query venues
                 {:aggregation [[:share [:and
                                         [:segment 1]
                                         [:or
                                          [:segment 2]
                                          [:> $price 1]]]]]})))))))

(deftest ^:parallel segment-in-case-expression-test
  (testing "a :segment reference nested inside a :case custom expression is expanded (#24922)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (=? {:stages [{:expressions [[:case {:lib/expression-name "CC"}
                                        [[[:= {} [:field {:base-type :type/Text} (meta/id :venues :name)] "abc"]
                                          "Segment"]]
                                        "Other"]]}]}
              (expand-macros
               (-> (lib/query mock-metadata-provider (meta/table-metadata :venues))
                   (lib/expression "CC" (lib/case [[(lib/segment 1) "Segment"]] "Other")))))))))

(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (let [before       (lib.tu.macros/$ids
                           checkins
                           {:source-table $$checkins
                            :filter       [:segment 2]})
            after-filter [:is-null {} [:field {:base-type :type/Integer} (meta/id :venues :category-id)]]
            after        {:source-table (meta/id :checkins)
                          :filters      [after-filter]}]
        (testing "nested 1 level"
          (is (=? {:stages [after {}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query before})))))
        (testing "nested 2 levels"
          (is (=? {:stages [after {} {}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query before}})))))
        (testing "nested 3 levels"
          (is (=? {:stages [after {} {} {}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query {:source-query before}}})))))
        (testing "nested at different levels"
          (is (=? {:stages [after
                            (dissoc after :source-table)
                            {}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query (-> before
                                        (dissoc :source-table)
                                        (assoc :source-query before))})))))
        (testing "inside :source-query inside :joins"
          (is (=? {:stages [{:source-table (meta/id :checkins)
                             :joins        [{:conditions [[:= {} [:field {} (meta/id :checkins :venue-id)] 2]]
                                             :stages     [after]}]}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:condition    [:= $venue-id 2]
                               :source-query before}]})))))
        (testing "inside join condition"
          (is (=? {:stages [{:source-table (meta/id :checkins)
                             :joins        [{:stages     [{:source-table (meta/id :checkins)}]
                                             :conditions [after-filter]}]}]}
                  (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:source-table $$checkins
                               :condition    (:filter before)}]})))))
        (testing "inside :joins inside :source-query"
          (is (=? {:stages [{:source-table (meta/id :checkins)
                             :joins        [{:conditions [[:= {} [:field {} (meta/id :checkins :venue-id)] 2]]
                                             :stages     [after]}]}
                            {}]}
                  (expand-macros (lib.tu.macros/mbql-query nil
                                   {:source-query {:source-table $$checkins
                                                   :joins        [{:condition    [:= $checkins.venue-id 2]
                                                                   :source-query before}]}})))))))))
