(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> lib.tu/venues-query
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
        ;; wrong arity: there's a bug in our Kondo config, see
        ;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
                  (lib/filter query (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/order-by (meta/field-metadata :venues :id))
                  (lib/limit 100))]
    (is (= (str "Venues,"
                " Sum of Price,"
                " Grouped by Category ID,"
                " Filtered by Name is Toucannery,"
                " Sorted by ID ascending,"
                " 100 rows")
           (lib/display-name query)
           (lib/describe-query query)
           (lib/suggested-name query)))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)}
                      {:lib/type :mbql.stage/mbql}
                      {:lib/type :mbql.stage/mbql}]}
          (lib/query meta/metadata-provider {:database (meta/id)
                                             :type     :query
                                             :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}}))))

(deftest ^:parallel with-different-table-test
  (let [query (-> (lib/query lib.tu/metadata-provider-with-mock-cards (meta/table-metadata :venues))
                  (lib/filter (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/limit 100)
                  (lib/append-stage))
        card-id (:id (lib.tu/mock-cards :orders))]
    (is (= [{:lib/type :mbql.stage/mbql :source-table (meta/id :orders)}]
           (:stages (lib/with-different-table query (meta/id :orders)))))
    (is (= [{:lib/type :mbql.stage/mbql :source-card card-id}]
           (:stages (lib/with-different-table query (str "card__" card-id)))))))

(deftest ^:parallel type-fill-in-converted-test
  (is (=? {:stages [{:fields [[:field {:base-type :type/BigInteger
                                       :effective-type :type/BigInteger}
                               (meta/id :venues :id)]]
                     :filters [[:= {} [:expression {:base-type :type/Integer :effective-type :type/Integer} "math"] 2]]}]}
          (lib/query
           meta/metadata-provider
            (lib.convert/->pMBQL {:type :query
                                  :database (meta/id)
                                  :query {:source-table (meta/id :venues)
                                          :expressions {"math" [:+ 1 1]}
                                          :fields [[:field (meta/id :venues :id) nil]]
                                          :filters [[:= [:expression "math"] 2]]}}))))
  (testing "filling in works for nested join queries"
    (let [clause (as-> (lib/expression lib.tu/venues-query "CC" (lib/+ 1 1)) $q
                   (lib/join-clause $q [(lib/= (meta/field-metadata :venues :id)
                                               (lib/expression-ref $q "CC"))]))
          query (lib/join lib.tu/venues-query clause)
          ;; Make a legacy query but don't put types in :field and :expression
          converted-query (lib.convert/->pMBQL
                            (walk/postwalk
                              (fn [node]
                                (if (map? node)
                                  (dissoc node :base-type :effective-type)
                                  node))
                              (lib.convert/->legacy-MBQL query)))]
      (is (=? {:stages [{:joins [{:conditions [[:= {}
                                                [:field {:base-type :type/BigInteger} (meta/id :venues :id)]
                                                [:expression
                                                 {}
                                                 ;; TODO Fill these in?
                                                 #_{:base-type :type/Integer}
                                                 "CC"]]]}]}]}

              (lib/query meta/metadata-provider converted-query))))))

(deftest ^:parallel stage-count-test
  (is (= 1 (lib/stage-count lib.tu/venues-query)))
  (is (= 2 (lib/stage-count (lib/append-stage lib.tu/venues-query))))
  (is (= 3 (lib/stage-count (lib/append-stage (lib/append-stage lib.tu/venues-query))))))
