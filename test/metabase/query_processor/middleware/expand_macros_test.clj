(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]))

(defn- expand-macros
  "If input is a legacy query, convert to pMBQL, call [[expand-macros/expand-macros]], then convert back to legacy. This
  way we don't need to update all the tests below right away."
  [query]
  (if (:type query) ; legacy query
    (let [metadata-provider (if (qp.store/initialized?)
                              (qp.store/metadata-provider)
                              meta/metadata-provider)]
      (-> (lib.query/query metadata-provider query)
          (#'expand-macros/expand-macros)
          lib.convert/->legacy-MBQL))
    (#'expand-macros/expand-macros query)))

(deftest ^:parallel basic-expansion-test
  (testing "no Segment should yield exact same query"
    (is (=? (lib.tu.macros/mbql-query venues
              {:filter   [:> $price 1]
               :breakout [$category-id]})
            (expand-macros
             (lib.tu.macros/mbql-query venues
               {:filter   [:> $price 1]
                :breakout [$category-id]}))))))

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
    (is (=? {:database (meta/id)
             :type :query
             :query {:source-table (meta/id :venues)
                     :breakout [[:field (meta/id :venues :category-id) nil]]
                     :filter [:and
                              [:= [:field (meta/id :venues :name) {:base-type :type/Text}] "abc"]
                              [:or
                               [:is-null [:field (meta/id :venues :category-id) {:base-type :type/Integer}]]
                               [:> [:field (meta/id :venues :price) nil] 1]]]}}
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
        (is (=? {:database (meta/id)
                 :type :query
                 :query {:source-table (meta/id :venues)
                         :filter [:and
                                  [:= [:field (meta/id :venues :name) {:base-type :type/Text}] "abc"]
                                  [:> [:field (meta/id :venues :price) {:base-type :type/Integer}] 1]]}}
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
      (is (=? {:database (meta/id)
               :type :query
               :query {:source-table (meta/id :venues)
                       :aggregation [[:share [:and
                                              [:= [:field (meta/id :venues :name) {:base-type :type/Text}] "abc"]
                                              [:or
                                               [:is-null [:field (meta/id :venues :category-id) {:base-type :type/Integer}]]
                                               [:> [:field (meta/id :venues :price) nil] 1]]]]]}}
              (expand-macros
               (lib.tu.macros/mbql-query venues
                 {:aggregation [[:share [:and
                                         [:segment 1]
                                         [:or
                                          [:segment 2]
                                          [:> $price 1]]]]]})))))))

(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (let [{:keys [before after]} (lib.tu.macros/$ids
                                     checkins
                                     {:before {:source-table $$checkins
                                               :filter       [:segment 2]}
                                      :after  {:source-table $$checkins
                                               :filter [:is-null [:field (meta/id :venues :category-id) {:base-type :type/Integer}]]}})]
        (testing "nested 1 level"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query after})
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query before})))))
        (testing "nested 2 levels"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query {:source-query after}})
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query before}})))))
        (testing "nested 3 levels"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query {:source-query {:source-query after}}})
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query {:source-query before}}})))))
        (testing "nested at different levels"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query (-> after
                                       (dissoc :source-table)
                                       (assoc :source-query after))})
                  (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query (-> before
                                        (dissoc :source-table)
                                        (assoc :source-query before))})))))
        (testing "inside :source-query inside :joins"
          (is (=? (lib.tu.macros/mbql-query checkins
                    {:joins [{:condition    [:= $venue-id 2]
                              :source-query after}]})
                  (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:condition    [:= $venue-id 2]
                               :source-query before}]})))))
        (testing "inside join condition"
          (is (=? (lib.tu.macros/mbql-query checkins
                    {:joins [{:source-table $$checkins
                              :condition    (:filter after)}]})
                  (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:source-table $$checkins
                               :condition    (:filter before)}]})))))
        (testing "inside :joins inside :source-query"
          (is (=? (lib.tu.macros/mbql-query nil
                    {:source-query {:source-table $$checkins
                                    :joins        [{:condition    [:= $checkins.venue-id 2]
                                                    :source-query after}]}})
                  (expand-macros (lib.tu.macros/mbql-query nil
                                   {:source-query {:source-table $$checkins
                                                   :joins        [{:condition    [:= $checkins.venue-id 2]
                                                                   :source-query before}]}})))))))))
