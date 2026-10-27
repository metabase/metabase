(ns metabase.lib.schema.expression.window-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest are is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.test-metadata :as meta]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel normalize-offset-test
  (are [x] (=? [:offset
                {:lib/uuid string?, :effective-type :type/Float}
                [:field
                 {:base-type :type/Float, :effective-type :type/Float, :lib/uuid string?}
                 1]
                -1]
               (lib.normalize/normalize x))
    [:offset
     {:effective-type "type/Float"}
     [:field
      {:base-type "type/Float", :effective-type "type/Float"}
      1]
     -1]

    ["offset"
     {"effective-type" "type/Float"}
     ["field"
      {"base-type" "type/Float", "effective-type" "type/Float"}
      1]
     -1]))

;;;; `:window`

(defn- field [column-name base-type]
  [:field {:lib/uuid (str (random-uuid)) :base-type base-type} column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(defn- window
  ([f partitions orders] (window {} f partitions orders))
  ([opts f partitions orders]
   [:window (merge {:lib/uuid (str (random-uuid))} opts)
    f
    (into [:partition-by {:lib/uuid (str (random-uuid))}] partitions)
    (into [:order-by {:lib/uuid (str (random-uuid))}] orders)]))

(defn- named [expression-name expr]
  (assoc-in expr [1 :lib/expression-name] expression-name))

(defn- stage [& {:as m}]
  (merge {:lib/type :mbql.stage/mbql :source-table (meta/id :venues)} m))

(def ^:private funnel-step
  "MIN(CASE WHEN PRICE = 4 THEN ID END) OVER (PARTITION BY CATEGORY_ID ORDER BY ID DESC
                                             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)"
  (window {:frame {:mode :rows :start :unbounded-preceding :end [:preceding 1]}}
          (clause :min (clause :case [[(clause := (field "PRICE" :type/Integer) 4) (field "ID" :type/Integer)]]))
          [(field "CATEGORY_ID" :type/Integer)]
          [(clause :desc (field "ID" :type/Integer))]))

(deftest ^:parallel window-schema-test
  (testing "the window shapes product analytics uses"
    (are [expr] (mr/validate :mbql.clause/window expr)
      (window (clause :row-number) [(field "CATEGORY_ID" :type/Integer)]
              [(clause :asc (field "ID" :type/Integer))
               (clause :asc (clause :case [[(clause := (field "PRICE" :type/Integer) 1) 0]] 1))])
      funnel-step
      (window (clause :lead (field "NAME" :type/Text) 2) [(field "CATEGORY_ID" :type/Integer)] [(clause :asc (field "ID" :type/Integer))])
      (window (clause :lag (field "NAME" :type/Text) 1 "none") [(field "CATEGORY_ID" :type/Integer)] [(clause :asc (field "ID" :type/Integer))])
      (window {:frame {:mode :rows :start :unbounded-preceding :end :current-row}}
              (clause :sum (field "PRICE" :type/Integer)) [(field "CATEGORY_ID" :type/Integer)] [(clause :asc (field "ID" :type/Integer))])
      (window (clause :min (field "NAME" :type/Text)) [(field "CATEGORY_ID" :type/Integer)] [])
      (window (clause :count) [] [])))
  (testing "not a window"
    (are [expr] (not (mr/validate :mbql.clause/window expr))
      (window (clause :avg (field "PRICE" :type/Integer)) [] [])
      (window {:frame {:mode :rows :start :unbounded-following :end :current-row}} (clause :count) [] [])
      (window {:frame {:mode :rows :start :current-row :end :unbounded-preceding}} (clause :count) [] [])
      (window {:frame {:mode :range :start :unbounded-preceding :end :current-row}} (clause :count) [] [])
      (window {:frame {:mode :rows :start [:preceding -1] :end :current-row}} (clause :count) [] []))))

(deftest ^:parallel normalize-window-frame-test
  (is (=? [:window {:frame {:mode :rows :start :unbounded-preceding :end [:preceding 1]}}
           [:min {} [:field {} "PRICE"]]
           [:partition-by {}]
           [:order-by {} [:desc {} [:field {} "ID"]]]]
          (lib.normalize/normalize
           ["window" {"frame" {"mode" "rows" "start" "unbounded-preceding" "end" ["preceding" 1]}}
            ["min" {} ["field" {"base-type" "type/Integer"} "PRICE"]]
            ["partition-by" {}]
            ["order-by" {} ["desc" {} ["field" {"base-type" "type/Integer"} "ID"]]]]))))

(deftest ^:parallel window-type-test
  (are [expected expr] (= expected (expression/type-of expr))
    :type/Integer (window (clause :row-number) [] [])
    :type/Integer (window (clause :count) [] [])
    :type/Text    (window (clause :lag (field "NAME" :type/Text) 1) [] [])
    :type/Integer funnel-step
    :type/Integer (window (clause :sum (field "PRICE" :type/Integer)) [] [])))

(deftest ^:parallel window-stage-test
  (testing "a stage computes windows after its filters and before any summary"
    (is (mr/validate :metabase.lib.schema/stage
                     (stage :expressions [(named "step" funnel-step)]
                            :filters [(clause := (field "PRICE" :type/Integer) 1)]))))
  (testing "where SQL can't compute a window"
    (are [a-stage] (not (mr/validate :metabase.lib.schema/stage a-stage))
      (stage :expressions [(named "step" funnel-step)]
             :aggregation [(clause :count)])
      (stage :expressions [(named "step" funnel-step)]
             :filters [(clause :not-null [:expression {:lib/uuid (str (random-uuid)) :base-type :type/Integer} "step"])])
      (stage :expressions [(named "x" (clause :lag (field "NAME" :type/Text) 1))])
      (stage :filters [(clause := funnel-step 1)]))))

(deftest ^:parallel window-returned-columns-test
  (let [q (lib/query meta/metadata-provider
                     {:lib/type :mbql/query
                      :database (meta/id)
                      :stages   [(stage :expressions [(named "rn" (window (clause :row-number) [] [(clause :asc (field "ID" :type/Integer))]))
                                                      (named "next_name" (window (clause :lead (field "NAME" :type/Text) 1) [] [(clause :asc (field "ID" :type/Integer))]))])]})]
    (is (= [["rn" :type/Integer] ["next_name" :type/Text]]
           (mapv (juxt :name :base-type) (take-last 2 (lib/returned-columns q)))))))
