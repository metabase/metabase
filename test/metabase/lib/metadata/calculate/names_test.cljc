(ns metabase.lib.metadata.calculate.names-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculate.names :as calculate.names]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel join-strings-with-conjunction-test
  (are [coll expected] (= expected
                          (calculate.names/join-strings-with-conjunction "and" coll))
    []                nil
    ["a"]             "a"
    ["a" "b"]         "a and b"
    ["a" "b" "c"]     "a, b, and c"
    ["a" "b" "c" "d"] "a, b, c, and d"))

(def ^:private venues-query
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(defn- field-clause
  ([table field]
   (field-clause table field nil))
  ([table field options]
   [:field (merge {:lib/uuid (str (random-uuid))} options) (meta/id table field)]))

(deftest ^:parallel display-name-from-name-test
  (testing "Use the 'simple humanization' logic to calculate a display name for a Field that doesn't have one (e.g. from results metadata)"
    (is (= "Venue ID"
           (calculate.names/display-name venues-query -1 {:lib/type :metadata/field
                                                          :name     "venue_id"})))))

(defn- aggregation-display-name [aggregation-clause]
  (calculate.names/display-name venues-query -1 aggregation-clause))

(defn- aggregation-column-name [aggregation-clause]
  (calculate.names/column-name venues-query -1 aggregation-clause))

(deftest ^:parallel aggregation-names-test
  (are [aggregation-clause expected] (= expected
                                        {:column-name  (aggregation-column-name aggregation-clause)
                                         :display-name (aggregation-display-name aggregation-clause)})
    [:count {}]
    {:column-name "count", :display-name "Count"}

    [:distinct {} (field-clause :venues :id)]
    {:column-name "distinct_id", :display-name "Distinct values of ID"}

    [:sum {} (field-clause :venues :id)]
    {:column-name "sum_id", :display-name "Sum of ID"}

    [:+ {} [:count {}] 1]
    {:column-name "count_plus_1", :display-name "Count + 1"}

    [:+
     {}
     [:min {} (field-clause :venues :id)]
     [:* {} 2 [:avg {} (field-clause :venues :price)]]]
    {:column-name  "min_id_plus_2_times_avg_price"
     :display-name "Min of ID + (2 × Average of Price)"}

    [:+
     {}
     [:min {} (field-clause :venues :id)]
     [:*
      {}
      2
      [:avg {} (field-clause :venues :price)]
      3
      [:- {} [:max {} (field-clause :venues :category-id)] 4]]]
    {:column-name  "min_id_plus_2_times_avg_price_times_3_times_max_category_id_minus_4"
     :display-name "Min of ID + (2 × Average of Price × 3 × (Max of Category ID - 4))"}

    ;; user-specified names
    [:+
     {:name "generated_name", :display-name "User-specified Name"}
     [:min {} (field-clause :venues :id)]
     [:* {} 2 [:avg {} (field-clause :venues :price)]]]
    {:column-name "generated_name", :display-name "User-specified Name"}

    [:+
     {:name "generated_name"}
     [:min {} (field-clause :venues :id)]
     [:* {} 2 [:avg {} (field-clause :venues :price)]]]
    {:column-name "generated_name", :display-name "Min of ID + (2 × Average of Price)"}

    [:+
     {:display-name "User-specified Name"}
     [:min {} (field-clause :venues :id)]
     [:* {} 2 [:avg {} (field-clause :venues :price)]]]
    {:column-name  "min_id_plus_2_times_avg_price"
     :display-name "User-specified Name"}))

(deftest ^:parallel date-interval-test
  (let [clause [:datetime-add
                {}
                (field-clause :checkins :date {:base-type :type/Date})
                -1
                :day]]
    (is (= "date_minus_1_day"
           (calculate.names/column-name venues-query -1 clause)))
    (is (= "Date - 1 day"
           (calculate.names/display-name venues-query -1 clause)))))

(deftest ^:parallel expression-reference-test
  (let [query (assoc-in venues-query
                        [:stages 0 :expressions "double-price"]
                        [:*
                         {:lib/uuid (str (random-uuid))}
                         (field-clause :venues :price {:base-type :type/Integer})
                         2])
        expr  [:sum
               {:lib/uuid (str (random-uuid))}
               [:expression {:lib/uuid (str (random-uuid))} "double-price"]]]
    (is (= "Sum of double-price"
           (calculate.names/display-name query -1 expr)))
    (is (= "sum_double-price"
           (calculate.names/column-name query -1 expr)))))

(deftest ^:parallel coalesce-test
  (let [clause [:coalesce {} (field-clause :venues :name) "<Venue>"]]
    (is (= "name"
           (calculate.names/column-name venues-query -1 clause)))
    (is (= "Name"
           (calculate.names/display-name venues-query -1 clause)))))
