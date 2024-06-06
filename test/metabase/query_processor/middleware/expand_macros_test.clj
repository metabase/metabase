(ns metabase.query-processor.middleware.expand-macros-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.expand-macros :as expand-macros]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

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
  (testing "no Segment or Metric should yield exact same query"
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
                :definition {:filter [:is-null [:field 7 nil]]}}]
    :metrics  [{:id         1
                :name       "Metric 1"
                :table-id   (meta/id :venues)
                :definition {:aggregation [[:aggregation-options
                                            [:sum [:field 20 nil]]
                                            {:display-name "My Cool Aggregation"}]]
                             :filter      [:= [:field 5 nil] "abc"]}}]}))

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

(deftest ^:parallel metric-test
  (testing "just a metric (w/out nested segments)"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:display-name "My Cool Aggregation"}]]
               :filter      [:and
                             [:> [:field 4 nil] 1]
                             [:= [:field 5 nil] "abc"]]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (expand-macros
              (mbql-query
               {:aggregation [[:metric 1]]
                :filter      [:> [:field 4 nil] 1]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel use-metric-filter-definition-test
  (testing "check that when the original filter is empty we simply use our metric filter definition instead"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "ABC Fields"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:count]]
                                                               :filter      [:= [:field 5 nil] "abc"]}}]})
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:count] {:display-name "ABC Fields"}]]
               :filter       [:= [:field 5 nil] "abc"]
               :breakout     [[:field 17 nil]]
               :order-by     [[:asc [:field 1 nil]]]})
             (expand-macros
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric 1]]
                :breakout     [[:field 17 nil]]
                :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel metric-with-no-filter-test
  (testing "metric w/ no filter definition"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "My Metric"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:count]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:count] {:display-name "My Metric"}]]
               :filter      [:= [:field 5 nil] "abc"]
               :breakout    [[:field 17 nil]]
               :order-by    [[:asc [:field 1 nil]]]})
             (expand-macros
              (mbql-query
               {:aggregation [[:metric 1]]
                :filter      [:= [:field 5 nil] "abc"]
                :breakout    [[:field 17 nil]]
                :order-by    [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel metric-with-nested-segments-test
  (testing "metric w/ nested segments"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      mock-metadata-provider
                                      {:metrics [{:id         1
                                                  :name       "My Metric"
                                                  :table-id   (meta/id :venues)
                                                  :definition {:aggregation [[:sum [:field 18 nil]]]
                                                               :filter      [:and
                                                                             [:between [:field 9 nil] 0 25]
                                                                             [:segment 1]]}}]})
      (testing "Sanity check: make sure we're overriding the old Metric 1 from mock-metadata-provider"
        (is (=? {:name "My Metric"}
                (lib.metadata/legacy-metric (qp.store/metadata-provider) 1))))
      (is (= (mbql-query
              {:source-table 1000
               :aggregation  [[:aggregation-options [:sum [:field 18 nil]] {:display-name "My Metric"}]]
               :filter       [:and
                              [:> [:field 4 nil] 1]
                              [:is-null [:field 7 nil]]       ; from Segment 2
                              [:between [:field 9 nil] 0 25]  ; from Metric 1
                              [:= [:field 5 nil] "abc"]]      ; from Metric 1 => Segment 1
               :breakout     [[:field 17 nil]]
               :order-by     [[:asc [:field 1 nil]]]})
             (expand-macros
              (mbql-query
               {:source-table 1000
                :aggregation  [[:metric 1]]
                :filter       [:and
                               [:> [:field 4 nil] 1]
                               [:segment 2]]
                :breakout     [[:field 17 nil]]
                :order-by     [[:asc [:field 1 nil]]]})))))))

(deftest ^:parallel metric-with-multiple-aggregation-syntax-test
  (testing "Check that a metric w/ multiple aggregation syntax (nested vector) still works correctly"
    ;; so-called "multiple aggregation syntax" is the norm now -- query normalization will do this automatically
    (mt/test-drivers (mt/normal-drivers-with-feature :expression-aggregations)
      (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                        (lib.metadata.jvm/application-database-metadata-provider (mt/id))
                                        {:metrics [(mt/$ids venues
                                                     {:id         1
                                                      :name       "Metric 1"
                                                      :table-id   $$venues
                                                      :definition {:aggregation [[:sum $price]]
                                                                   :filter      [:> $price 1]}})]})
        (is (= [[2 118]
                [3  39]
                [4  24]]
               (mt/formatted-rows [int int]
                 (mt/run-mbql-query venues
                   {:aggregation [[:metric 1]]
                    :breakout    [$price]}))))))))

(deftest ^:parallel named-metrics-test
  (testing "make sure we can name a :metric"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "My Metric"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "Named Metric"}]]
               :breakout    [[:field 10 nil]]})
             (expand-macros
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric 1] {:display-name "Named Metric"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest include-display-name-test
  (testing (str "if the `:metric` is wrapped in aggregation options that do *not* give it a display name, "
                "`:display-name` should be added to the options")
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "Metric 1"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:sum [:field 20 nil]]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Metric 1"}]]
               :breakout    [[:field 10 nil]]})
             (expand-macros
              (mbql-query {:aggregation [[:aggregation-options
                                          [:metric 1] {:name "auto_generated_name"}]]
                           :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-2
  (testing "a Metric whose :aggregation is already named should not get wrapped in an `:aggregation-options` clause"
    (qp.store/with-metadata-provider mock-metadata-provider
      (is (=? (mbql-query
               {:aggregation [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
                :breakout    [[:field 10 nil]]})
              (expand-macros
               (mbql-query {:aggregation [[:metric 1]]
                            :breakout    [[:field 10 nil]]})))))))

(deftest ^:parallel include-display-name-test-3
  (testing "...but if it's wrapped in `:aggregation-options`, but w/o given a display name, we should merge the options"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:metrics  [{:id         1
                                                   :name       "Metric 1"
                                                   :table-id   (meta/id :venues)
                                                   :definition {:aggregation [[:aggregation-options
                                                                               [:sum [:field 20 nil]]
                                                                               {:name "auto_generated_name"}]]}}]})
      (is (= (mbql-query
              {:aggregation [[:aggregation-options
                              [:sum [:field 20 nil]]
                              {:name "auto_generated_name", :display-name "Metric 1"}]]
               :breakout    [[:field 10 nil]]})
             (expand-macros
              (mbql-query {:aggregation [[:metric 1]]
                           :breakout    [[:field 10 nil]]})))))))

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
      (doseq [[macro-type {:keys [before after]}]
              (lib.tu.macros/$ids checkins
                {"Metrics"
                 {:before {:source-table $$checkins
                           :aggregation  [[:metric 1]]}
                  :after  {:source-table $$checkins
                           :aggregation  [[:aggregation-options [:sum [:field 20 nil]] {:display-name "My Cool Aggregation"}]]
                           :filter       [:= [:field 5 nil] "abc"]}}

                 "Segments"
                 {:before {:source-table $$checkins
                           :filter       [:segment 2]}
                  :after  {:source-table $$checkins
                           :filter       [:is-null [:field 7 nil]]}}})]
        (testing macro-type
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
          (when (= macro-type "Segments")
            (testing "inside join condition"
              (is (= (lib.tu.macros/mbql-query checkins
                       {:joins [{:source-table $$checkins
                                 :condition    (:filter after)}]})
                     (expand-macros
                      (lib.tu.macros/mbql-query checkins
                        {:joins [{:source-table $$checkins
                                  :condition    (:filter before)}]}))))))
          (testing "inside :joins inside :source-query"
            (is (= (lib.tu.macros/mbql-query nil
                     {:source-query {:source-table $$checkins
                                     :joins        [{:condition    [:= [:field 1 nil] 2]
                                                     :source-query after}]}})
                   (expand-macros (lib.tu.macros/mbql-query nil
                                    {:source-query {:source-table $$checkins
                                                    :joins        [{:condition    [:= [:field 1 nil] 2]
                                                                    :source-query before}]}}))))))))))

(deftest ^:parallel preserve-uuids-test
  (testing "the aggregation that replaces a :metric ref should keep the :metric's :lib/uuid, so :aggregation refs pointing to it are still valid"
    (let [metric            {:lib/type    :metadata/legacy-metric
                             :id          1
                             :table-id    2
                             :name        "Revenue"
                             :description "Sum of orders subtotal"
                             :archived    false
                             :definition  {:source-table 2, :aggregation [[:sum [:field 17 nil]]]}}
          metadata-provider (lib.tu/mock-metadata-provider
                             meta/metadata-provider
                             {:metrics [metric]})]
      (is (=? {:stages                 [{:lib/type     :mbql.stage/mbql
                                         :source-table (meta/id :orders)
                                         :aggregation  [[:sum
                                                         {:lib/uuid "0c586819-5288-4da9-adba-1ae904a34d5e"}
                                                         [:field {} 17]]]
                                         :order-by     [[:desc
                                                         {}
                                                         [:aggregation
                                                          {}
                                                          "0c586819-5288-4da9-adba-1ae904a34d5e"]]]}]
               :database               (meta/id)}
              (#'expand-macros/expand-macros
               {:lib/type               :mbql/query
                :lib/metadata           metadata-provider
                :stages                 [{:lib/type     :mbql.stage/mbql
                                          :source-table (meta/id :orders)
                                          :aggregation  [[:metric {:lib/uuid "0c586819-5288-4da9-adba-1ae904a34d5e"} 1]]
                                          :order-by     [[:desc
                                                          {:lib/uuid "4bfcc7da-1e47-41aa-af2c-bbdf11b8d6be"}
                                                          [:aggregation
                                                           {:lib/uuid "7fb46618-622c-40f3-b0d4-4a779179f055"}
                                                           "0c586819-5288-4da9-adba-1ae904a34d5e"]]]}]
                :database               (meta/id)}))))))

(deftest ^:parallel mbql-2-macro-expansion-test
  (testing "If the Macro is using super-legacy MBQL 2 can we still expand it?"
    (is (=? {:aggregation [[:sum-where
                            {}
                            [:field {} (meta/id :venues :price)]
                            [:<
                             {}
                             [:field {} (meta/id :venues :price)]
                             4]]]}
            (#'expand-macros/legacy-macro-definition->pMBQL
             meta/metadata-provider
             {:lib/type   :metadata/legacy-metric
              :id         1
              :name       "Metric 1"
              :table-id   (meta/id :venues)
              :definition {:source-table (meta/id :venues)
                           ;; note that `:aggregation` here is a single aggregation rather than a sequence of
                           ;; aggregations, which is how we did things in MBQL 1 and 2. Also `:field` clauses are don't
                           ;; have options map or `nil` which wasn't added until MBQL 4
                           :aggregation  [:sum-where
                                          [:field (meta/id :venues :price)]
                                          [:< [:field (meta/id :venues :price)] 4]]}})))))
