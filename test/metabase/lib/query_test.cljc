(ns metabase.lib.query-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
        ;; wrong arity: there's a bug in our Kondo config, see https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
                  (lib/filter query (lib/= (meta/field-metadata :venues :name) "Toucannery"))
                  (lib/breakout (meta/field-metadata :venues :category-id))
                  (lib/order-by (meta/field-metadata :venues :id))
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
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/native-query meta/metadata-provider meta/qp-results-metadata "SELECT * FROM VENUES;"))))

(deftest ^:parallel native-query-suggested-name-test
  (let [query (lib/native-query meta/metadata-provider meta/qp-results-metadata "SELECT * FROM VENUES;")]
    (is (= "Native query"
           (lib.metadata.calculation/describe-query query)))
    (is (nil? (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel card-source-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type    :mbql.stage/native
                       :native      "SELECT * FROM VENUES;"}]}
          (lib/saved-question-query meta/metadata-provider
                                    {:dataset-query   {:database (meta/id)
                                                       :type     :native
                                                       :native   {:query "SELECT * FROM VENUES;"}}
                                     :result-metadata meta/card-results-metadata}))))

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
