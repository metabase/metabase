(ns metabase.lib.analysis-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.analysis :as analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel basic-habit-test
  (let [mp meta/metadata-provider
        table (lib.metadata/table mp (meta/id :orders))
        query (lib/query mp table)
        columns (zipmap (map :display-name (lib/returned-columns query))
                        (lib/returned-columns query))
        created-at-field (column/column-unique-key (columns "Created At"))
        user-id-field (column/column-unique-key (columns "User ID"))
        analysis {:kind :habit
                  :base-query query
                  :columns.person user-id-field
                  :columns.timestamp created-at-field
                  :habit.values :count ; or :percent
                  :granularity :day}]
    (testing "basic habit"
      (is (=? {:lib/type :mbql/query
               :stages [{:lib/type :mbql.stage/mbql
                         :source-table (:id table)
                         :aggregation
                         [[:distinct {:name "periods"}
                           [:field {:effective-type :type/DateTimeWithLocalTZ
                                    :base-type :type/DateTimeWithLocalTZ
                                    :temporal-unit :day}
                            (:id (columns "Created At"))]]]
                         :breakout [[:field {:effective-type :type/Integer
                                             :base-type :type/Integer}
                                     (:id (columns "User ID"))]]}
                        {:lib/type :mbql.stage/mbql
                         :aggregation [[:count {:name "people"}]]
                         :breakout [[:field {:effective-type :type/Integer
                                             :base-type :type/Integer}
                                     "periods"]]}]}
              (analysis/->mbql analysis))))
    (testing "habit with percent"
      (let [analysis (assoc analysis :habit.values :percent)]
        (is (=? {:lib/type :mbql.stage/mbql
                 :aggregation [[:/ {:name "people"}
                                [:count {}]
                                [:window {}
                                 [:sum {} [:count {}]]
                                 {:partition-by []}]]]}
                (-> (analysis/->mbql analysis)
                    :stages
                    second)))))))

(defn- orders-query []
  (lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :orders))))

(defn- filterable-column [query column-name]
  (m/find-first #(= column-name (:name %)) (lib/filterable-columns query)))

(deftest ^:parallel add-events-test
  (let [base       (orders-query)
        is-widget  (lib/= (filterable-column base "CATEGORY") "Widget")
        over-ten   (lib/> (filterable-column base "TOTAL") 10)]
    (testing "one condition becomes the expression, several are ANDed"
      (is (=? [[:= {:lib/expression-name "one"} [:field {:source-field (meta/id :orders :product-id)}
                                                 (meta/id :products :category)]
                "Widget"]
               [:and {:lib/expression-name "two"}
                [:= {} [:field {} (meta/id :products :category)] "Widget"]
                [:> {} [:field {} (meta/id :orders :total)] 10]]]
              (lib/expressions (analysis/add-events base {"one" [is-widget], "two" [is-widget over-ten]})))))
    (testing "an event can share a condition with the base query's filters"
      (let [widgets (lib/filter base is-widget)]
        (is (mr/validate ::lib.schema/query
                         (analysis/add-events widgets {"one" (lib/filters widgets)})))))
    (testing "an event with no conditions"
      (is (thrown-with-msg? #?(:clj Exception :cljs js/Error) #"at least one condition"
                            (analysis/add-events base {"one" []}))))))

(deftest ^:parallel habit-active-test
  (let [base     (orders-query)
        columns  (m/index-by :name (lib/returned-columns base))
        widget   (lib/filter base (lib/= (filterable-column base "CATEGORY") "Widget"))
        analysis {:kind              :habit
                  :base-query        base
                  :columns.person    (column/column-unique-key (columns "USER_ID"))
                  :columns.timestamp (column/column-unique-key (columns "CREATED_AT"))
                  :habit.values      :count
                  :granularity       :day}]
    (testing "the active event filters the events, and its name is ignored"
      (is (=? {:stages [{:expressions [[:= {:lib/expression-name "habit.active"} some? "Widget"]]
                         :filters     [[:expression {} "habit.active"]]}
                        {}]}
              (analysis/->mbql (assoc analysis :habit.active {:name "Bought a widget", :conditions (lib/filters widget)})))))
    (testing "the event's conditions can come in as stored, alongside keys the planner doesn't know"
      ;; Like `to-js-filter-clause`, then a JSON round trip.
      (let [->json (fn [x] (walk/postwalk #(cond-> % (keyword? %) u/qualified-name) x))
            stored (mapv #(lib/prepare-for-serialization ::lib.schema.expression/boolean %) (lib/filters widget))
            state  (-> analysis
                       (dissoc :base-query)
                       (assoc :habit.active {:name nil, :conditions stored}
                              :habit.unknown {:value 1})
                       ->json
                       (assoc "base_query" base))]
        (is (=? {:stages [{:expressions [[:= {:lib/expression-name "habit.active"} some? "Widget"]]
                           :filters     [[:expression {} "habit.active"]]}
                          {}]}
                (analysis/->mbql (lib.normalize/normalize ::analysis/analysis-state state))))))
    (testing "without an active event, every event counts"
      (is (=? {:stages [{:expressions (symbol "nil #_\"key is not present.\"")
                         :filters     (symbol "nil #_\"key is not present.\"")}
                        {}]}
              (analysis/->mbql (assoc analysis :habit.active nil)))))))
