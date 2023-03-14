(ns metabase.lib.query-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]))

(comment lib/keep-me)

(defn- FIXME-sum
  "Placeholder until we have a function for adding a `:sum` aggregation to a query."
  [query expr]
  (let [sum-clause (lib/sum query -1 expr)]
    (lib.util/update-query-stage query -1 update :aggregation (fn [aggregations]
                                                                (conj (vec aggregations) sum-clause)))))

(defn- FIXME-equals
  "Placeholder until we have a function for adding an `:=` aggregation to a query."
  [query x y]
  (let [=-clause (lib/= query -1 x y)]
    (lib.util/update-query-stage query -1 assoc :filter =-clause)))

(deftest ^:parallel describe-query-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (FIXME-sum (lib/field (meta/id :venues :price)))
                  (FIXME-equals (lib/field (meta/id :venues :name)) "Toucannery")
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
           (lib.metadata.calculation/describe-query query)))))

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type    :mbql.stage/native
                       :lib/options {:lib/uuid string?}
                       :native      "SELECT * FROM VENUES;"}]}
          (-> (lib/native-query meta/metadata-provider meta/results-metadata "SELECT * FROM VENUES;")
              (dissoc :lib/metadata)))))

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
