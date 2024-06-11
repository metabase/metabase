(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.store :as qp.store]))

(defn- mbql-query [inner-query]
  {:database (meta/id)
   :type     :query
   :query    (merge {:source-table 1}
                    inner-query)})

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
    (is (= (mbql-query
            {:filter   [:> [:field 4 nil] 1]
             :breakout [[:field 17 nil]]})
           (expand-macros
            (mbql-query
             {:filter   [:> [:field 4 nil] 1]
              :breakout [[:field 17 nil]]}))))))

(def ^:private mock-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:segments [{:id         1
                :name       "Segment 1"
                :table-id   (meta/id :venues)
                :definition {:filter [:= [:field 5 nil] "abc"]}}
               {:id         2
                :name       "Segment 2"
                :table-id   (meta/id :venues)
                :definition {:filter [:is-null [:field 7 nil]]}}]}))

(deftest ^:parallel segments-test
  (qp.store/with-metadata-provider mock-metadata-provider
    (is (= (mbql-query
            {:filter   [:and
                        [:= [:field 5 nil] "abc"]
                        [:or
                         [:is-null [:field 7 nil]]
                         [:> [:field 4 nil] 1]]]
             :breakout [[:field 17 nil]]})
           (expand-macros
            (mbql-query
             {:filter   [:and
                         [:segment 1]
                         [:or
                          [:segment 2]
                          [:> [:field 4 nil] 1]]]
              :breakout [[:field 17 nil]]}))))))

(deftest ^:parallel nested-segments-test
  (let [metadata-provider (lib.tu/mock-metadata-provider
                           mock-metadata-provider
                           {:segments [{:id         2
                                        :name       "Segment 2"
                                        :table-id   (meta/id :venues)
                                        :definition {:filter [:and
                                                              [:segment 1]
                                                              [:> [:field 6 nil] 1]]}}]})]
    (qp.store/with-metadata-provider metadata-provider
      (testing "Nested segments are correctly expanded (#30866)"
        (is (= (lib.tu.macros/mbql-query venues
                 {:filter [:and
                           [:= [:field 5 nil] "abc"]
                           [:> [:field 6 nil] 1]]})
               (expand-macros
                (lib.tu.macros/mbql-query venues
                  {:filter [:segment 2]}))))))
    ;; Next line makes temporary segment definitions mutually recursive.
    (let [metadata-provider' (lib.tu/mock-metadata-provider
                              metadata-provider
                              {:segments [(assoc (lib.metadata/segment metadata-provider 1)
                                                 :definition
                                                 {:filter [:and [:< (meta/id :venues :price) 3] [:segment 2]]})]})]
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
      (is (= (mbql-query
              {:aggregation [[:share [:and
                                      [:= [:field 5 nil] "abc"]
                                      [:or
                                       [:is-null [:field 7 nil]]
                                       [:> [:field 4 nil] 1]]]]]})
             (expand-macros
              (mbql-query
               {:aggregation [[:share [:and
                                       [:segment 1]
                                       [:or
                                        [:segment 2]
                                        [:> [:field 4 nil] 1]]]]]})))))))

(deftest ^:parallel expand-macros-in-nested-queries-test
  (testing "expand-macros should expand things in the correct nested level (#12507)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (let [{:keys [before after]} (lib.tu.macros/$ids
                                     checkins
                                     {:before {:source-table $$checkins
                                               :filter       [:segment 2]}
                                      :after  {:source-table $$checkins
                                               :filter       [:is-null [:field 7 nil]]}})]
        (testing "nested 1 level"
          (is (= (lib.tu.macros/mbql-query nil
                   {:source-query after})
                 (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query before})))))
        (testing "nested 2 levels"
          (is (= (lib.tu.macros/mbql-query nil
                   {:source-query {:source-query after}})
                 (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query before}})))))
        (testing "nested 3 levels"
          (is (= (lib.tu.macros/mbql-query nil
                   {:source-query {:source-query {:source-query after}}})
                 (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query {:source-query {:source-query before}}})))))
        (testing "nested at different levels"
          (is (= (lib.tu.macros/mbql-query nil
                   {:source-query (-> after
                                      (dissoc :source-table)
                                      (assoc :source-query after))})
                 (expand-macros
                   (lib.tu.macros/mbql-query nil
                     {:source-query (-> before
                                        (dissoc :source-table)
                                        (assoc :source-query before))})))))
        (testing "inside :source-query inside :joins"
          (is (= (lib.tu.macros/mbql-query checkins
                   {:joins [{:condition    [:= [:field 1 nil] 2]
                             :source-query after}]})
                 (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:condition    [:= [:field 1 nil] 2]
                               :source-query before}]})))))
        (testing "inside join condition"
          (is (= (lib.tu.macros/mbql-query checkins
                   {:joins [{:source-table $$checkins
                             :condition    (:filter after)}]})
                 (expand-macros
                   (lib.tu.macros/mbql-query checkins
                     {:joins [{:source-table $$checkins
                               :condition    (:filter before)}]})))))
        (testing "inside :joins inside :source-query"
          (is (= (lib.tu.macros/mbql-query nil
                   {:source-query {:source-table $$checkins
                                   :joins        [{:condition    [:= [:field 1 nil] 2]
                                                   :source-query after}]}})
                 (expand-macros (lib.tu.macros/mbql-query nil
                                  {:source-query {:source-table $$checkins
                                                  :joins        [{:condition    [:= [:field 1 nil] 2]
                                                                  :source-query before}]}})))))))))
