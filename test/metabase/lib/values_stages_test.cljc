(ns metabase.lib.values-stages-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli.registry :as mr]))

(defn- field [column-name base-type & {:as opts}]
  [:field (merge {:lib/uuid (str (random-uuid)) :base-type base-type} opts) column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(def ^:private steps
  {:lib/type :mbql.stage/mbql
   :name     "steps"
   :values   {:columns [{:name "step" :base-type :type/Integer} {:name "label" :base-type :type/Text}]
              :rows    [[1 "1. Cheap"] [2 "2. Pricier"] [3 nil]]}})

(def ^:private venues-per-step
  "Venues joined to the steps at or below their price."
  [{:lib/type :mbql.stage/mbql :name "venues" :source-table (meta/id :venues)}
   steps
   {:lib/type    :mbql.stage/mbql
    :source-stage "venues"
    :joins       [{:lib/type   :mbql/join :alias "s" :source-stage "steps" :strategy :inner-join :fields :all
                   :conditions [(clause :>= (field "PRICE" :type/Integer) (field "step" :type/Integer :join-alias "s"))]}]
    :breakout    [(field "step" :type/Integer :join-alias "s")]
    :aggregation [(clause :count)]}])

(defn- query [stages]
  (lib/query meta/metadata-provider {:lib/type :mbql/query :database (meta/id) :stages stages}))

(deftest ^:parallel values-schema-test
  (testing "valid: alone, or anywhere among other stages"
    (is (mr/validate :metabase.lib.schema/stages [steps]))
    (is (mr/validate :metabase.lib.schema/stages venues-per-step)))
  (testing "invalid"
    (are [stage] (not (mr/validate :metabase.lib.schema/stages [stage]))
      (assoc-in steps [:values :rows 0] [1])
      (assoc-in steps [:values :rows 0] ["one" "1. Cheap"])
      (assoc-in steps [:values :rows 0] [1 2])
      (assoc-in steps [:values :rows] [])
      (assoc-in steps [:values :columns 1 :name] "step")
      (assoc steps :source-table (meta/id :venues))
      (assoc-in steps [:values :rows 0 0] {:a 1}))
    (is (not (mr/validate :metabase.lib.schema/stages (assoc-in venues-per-step [1 :source-stage] "venues"))))))

(deftest ^:parallel values-columns-test
  (let [q (query venues-per-step)]
    (testing "a values stage reads nothing"
      (is (nil? (lib.util/source-stage-number q 1)))
      (is (lib.util/first-stage? q 1)))
    (testing "its columns are the declared ones"
      (is (= [["step" :type/Integer] ["label" :type/Text]]
             (mapv (juxt :name :base-type) (lib/returned-columns q 1)))))
    (testing "a join reads them"
      (is (= ["s__step" "count"] (mapv :lib/desired-column-alias (lib/returned-columns q 2)))))))

(deftest ^:parallel values-legacy-test
  (testing "the legacy form keeps the rows, where the join reads them"
    (let [legacy (lib.convert/->legacy-MBQL (query venues-per-step))]
      (is (= (:values steps) (-> legacy :query :joins first :source-query :values)))
      (is (mr/validate :metabase.legacy-mbql.schema/Query legacy))
      (testing "and comes back"
        (is (= (:values steps)
               (-> (lib/query meta/metadata-provider legacy) :stages last :joins first :stages first :values)))))))
