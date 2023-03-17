(ns metabase.lib.query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(comment lib/keep-me)

(deftest ^:parallel describe-query-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/aggregate (lib/sum (lib/field (meta/id :venues :price)))))
        ;; wrong arity: there's a bug in our Kondo config, see https://metaboat.slack.com/archives/C04DN5VRQM6/p1679022185079739?thread_ts=1679022025.317059&cid=C04DN5VRQM6
        query (-> #_{:clj-kondo/ignore [:invalid-arity]}
                  (lib/filter query (lib/= query -1 (lib/field (meta/id :venues :name)) "Toucannery"))
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
