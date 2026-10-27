(ns metabase.lib.union-all-stages-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

(defn- field [column-name base-type & {:as opts}]
  [:field (merge {:lib/uuid (str (random-uuid)) :base-type base-type} opts) column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(def ^:private stages
  "venues; cheap venues; pricey venues; cheap and pricey venues counted by price."
  [{:lib/type :mbql.stage/mbql :name "venues" :source-table (meta/id :venues)}
   {:lib/type :mbql.stage/mbql :name "cheap"
    :filters  [(clause := (field "PRICE" :type/Integer) 1)]
    :fields   [(field "NAME" :type/Text) (field "PRICE" :type/Integer)]}
   {:lib/type :mbql.stage/mbql :name "pricey" :source-stage "venues"
    :filters  [(clause := (field "PRICE" :type/Integer) 4)]
    :fields   [(field "NAME" :type/Text) (field "PRICE" :type/Integer)]}
   {:lib/type :mbql.stage/mbql :source-stage "cheap" :union-all ["pricey"]
    :breakout    [(field "PRICE" :type/Integer)]
    :aggregation [(clause :count)]}])

(defn- query
  ([] (query stages))
  ([query-stages] (lib/query meta/metadata-provider {:lib/type :mbql/query :database (meta/id) :stages query-stages})))

(deftest ^:parallel union-all-reads-test
  (let [q (query)]
    (testing "the branches are reads, after the source stage"
      (is (= ["cheap" "pricey"] (lib.util/stage-reads (last stages))))
      (is (= [1 2] (lib.util/union-all-stage-numbers q 3)))
      (is (nil? (lib.util/union-all-stage-numbers q 2))))
    (testing "the stage's columns come from its source stage"
      (is (= ["NAME" "PRICE"] (mapv :name (lib/visible-columns q 3 {:include-implicitly-joinable? false}))))
      (is (= ["PRICE" "count"] (mapv :lib/desired-column-alias (lib/returned-columns q 3)))))))

(deftest ^:parallel union-all-validation-test
  (doseq [[problem invalid-stages] {"no :source-stage"         (update stages 3 dissoc :source-stage)
                                    "a branch that comes later" (-> stages
                                                                    (assoc-in [3 :name] "result")
                                                                    (assoc-in [2 :union-all] ["result"]))
                                    "a missing branch"         (assoc-in stages [3 :union-all] ["nope"])
                                    "no branches"              (assoc-in stages [3 :union-all] [])}]
    (testing problem
      (is (not (mr/validate :metabase.lib.schema/stages invalid-stages))))))

(deftest ^:parallel union-all-column-count-test
  (testing "a branch must return as many columns as the source stage"
    (let [q (query (update-in stages [2 :fields] conj (field "ID" :type/Integer)))]
      (is (thrown-with-msg? #?(:clj Exception :cljs js/Error)
                            #"Stage 3 appends stage 2, which returns 3 columns, to stage 1, which returns 2"
                            (lib/returned-columns q 3))))))

(deftest ^:parallel union-all-legacy-test
  (testing "the legacy form is a tree: each branch is a source query of its own"
    (let [expanded (lib.util/expand-named-stages (query))
          legacy   (lib.convert/->legacy-MBQL (query))]
      (is (= 3 (count (:stages expanded))))
      (is (= 2 (count (-> expanded :stages last :union-all first))))
      (is (= #{:source-query :filter :fields}
             (set (keys (-> legacy :query :union-all first)))))
      (is (mr/validate :metabase.legacy-mbql.schema/Query legacy)))))
