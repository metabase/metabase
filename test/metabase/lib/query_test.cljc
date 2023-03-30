(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/aggregate (lib/sum (lib/field (meta/id :venues :price)))))
        ;; wrong arity: there's a bug in our Kondo config, see https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
                  (lib/filter query (lib/= (lib/field (meta/id :venues :name)) "Toucannery"))
                  (lib/breakout (lib/field (meta/id :venues :category-id)))
                  (lib/order-by (lib/field (meta/id :venues :id)))
                  (lib/limit 100))]
    (is (= (str "Venues,"
                " Sum of Price,"
                " Grouped by Category ID,"
                " Filtered by Name equals \"Toucannery\","
                " Sorted by ID ascending,"
                " 100 rows")
           (lib.metadata.calculation/display-name query -1 query)
           (lib.metadata.calculation/describe-query query)
           (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/native-query meta/metadata-provider meta/results-metadata "SELECT * FROM VENUES;"))))

(deftest ^:parallel native-query-suggested-name-test
  (let [query (lib/native-query meta/metadata-provider meta/results-metadata "SELECT * FROM VENUES;")]
    (is (= "Native query"
           (lib.metadata.calculation/describe-query query)))
    (is (nil? (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel card-source-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/saved-question-query meta/metadata-provider
                                    {:dataset_query   {:database (meta/id)
                                                       :type     :native
                                                       :native   {:query "SELECT * FROM VENUES;"}}
                                     :result_metadata meta/results-metadata}))))

(deftest ^:parallel notebook-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}]}
          (lib/query meta/metadata-provider {:database (meta/id)
                                             :type     :query
                                             :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}}))))

(deftest ^:parallel remove-clause-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/filter (lib/= "myvenue" (lib/field (meta/id :venues :name))))
                  (lib/order-by (lib/field (meta/id :venues :name)))
                  (lib/order-by (lib/field (meta/id :venues :name))))
        order-bys (lib/order-bys query)]
    (testing "order-bys"
      (is (= 2 (count order-bys)))
      (is (= 1 (-> query
                   (lib/remove-clause (first order-bys))
                   (lib/order-bys)
                   count)))
      (is (= 0 (-> query
                   (lib/remove-clause (first order-bys))
                   (lib/remove-clause (second order-bys))
                   (lib/order-bys)
                   count))))))

(deftest ^:parallel replace-clause-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/filter (lib/= "myvenue" (lib/field (meta/id :venues :name))))
                  (lib/order-by (lib/field (meta/id :venues :name)))
                  (lib/order-by (lib/field (meta/id :venues :name))))
        order-bys (lib/order-bys query)]
    (testing "order-bys"
      (is (= 2 (count order-bys)))
      (let [replaced (-> query
                         (lib/replace-clause (first order-bys) (lib/order-by-clause (lib/field (meta/id :venues :id)))))
            replaced-order-bys (lib/order-bys replaced)]
        (is (not= order-bys replaced-order-bys))
        (is (= 2 (count replaced-order-bys)))
        (is (= (second order-bys) (second replaced-order-bys)))))))
