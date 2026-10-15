(ns metabase.metrics.transforms-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.metrics.transforms :as metrics.transforms]
   [metabase.util.json :as json]))

(deftest ^:parallel normalize-target-ref-expression-test
  (testing "legacy expression refs keep their name (regression: the name was dropped, yielding [:expression {} nil])"
    (testing "2-element legacy ref"
      (let [[tag opts nm] (metrics.transforms/normalize-target-ref ["expression" "Category"])]
        (is (= :expression tag))
        (is (map? opts))
        (is (= "Category" nm))))
    (testing "3-element legacy ref with trailing nil options"
      (is (= "Category" (nth (metrics.transforms/normalize-target-ref ["expression" "Category" nil]) 2))))
    (testing "3-element legacy ref with options carries them into MBQL-5 opts position"
      (let [[tag opts nm] (metrics.transforms/normalize-target-ref ["expression" "Category" {:base-type "type/Text"}])]
        (is (= :expression tag))
        (is (= :type/Text (:base-type opts)))
        (is (= "Category" nm))))
    (testing "an already-MBQL-5 expression ref is left untouched"
      (is (= "Category"
             (nth (metrics.transforms/normalize-target-ref [:expression {:lib/uuid (str (random-uuid))} "Category"]) 2))))))

(deftest ^:parallel normalize-target-ref-field-test
  (testing "legacy field refs still relocate the id into MBQL-5 position (unchanged behavior)"
    (is (= 7 (nth (metrics.transforms/normalize-target-ref ["field" 7 nil]) 2)))
    (is (= 7 (nth (metrics.transforms/normalize-target-ref ["field" {} 7]) 2)))))

(deftest ^:parallel transform-dimensions-round-trip-test
  (testing "dimensions are kebab-case everywhere — in memory AND in the JSON at rest (matching master/metric-dimensions)"
    (let [dim-id    (str (random-uuid))
          canonical {:id                dim-id
                     :name              "category"
                     :display-name      "Category"
                     :effective-type    :type/Text
                     :semantic-type     :type/Category
                     :has-field-values  :list
                     :status            :status/active
                     :group             {:id "g1" :type "main" :display-name "Venues"}
                     :sources           [{:type :field :field-id 1}]}
          stored    ((:in metrics.transforms/transform-dimensions) [canonical])]
      (testing "the JSON at rest uses the same kebab-case keys (pass-through, no conversion)"
        (is (string? stored))
        (is (str/includes? stored "display-name"))
        (is (str/includes? stored "has-field-values"))
        (is (not (str/includes? stored "display_name"))))
      (testing ":out returns the canonical kebab-case shape with keywordized type values"
        (is (= [{:id               dim-id
                 :name             "category"
                 :display-name     "Category"
                 :effective-type   :type/Text
                 :semantic-type    :type/Category
                 :has-field-values :list
                 :status           :status/active
                 :group            {:id "g1" :type "main" :display-name "Venues"}
                 :sources          [{:type :field :field-id 1}]}]
               ((:out metrics.transforms/transform-dimensions) stored)))))))

(deftest ^:parallel transform-dimension-mappings-round-trip-test
  (testing "mappings are kebab-case at rest and in memory; :target rides untouched"
    (let [canonical {:dimension-id "d1"
                     :type         :table
                     :table-id     5
                     :target       ["field" {:base-type "type/Text"} 9]}
          stored    ((:in metrics.transforms/transform-dimension-mappings) [canonical])]
      (is (str/includes? stored "dimension-id"))
      (is (str/includes? stored "table-id"))
      (is (not (str/includes? stored "dimension_id")))
      (let [[mapping] ((:out metrics.transforms/transform-dimension-mappings) stored)
            [tag opts field-id] (:target mapping)]
        (is (= "d1" (:dimension-id mapping)))
        (is (= 5 (:table-id mapping)))
        (is (= :table (:type mapping)))
        (is (= :field tag))
        (is (= :type/Text (:base-type opts)))
        (is (= 9 field-id))))))

(defn- dimensions-out
  "Run stored-shape `dims` through the `:out` side of [[metrics.transforms/transform-dimensions]]
  the way a Toucan select would: JSON-encode then parse + normalize."
  [dims]
  ((:out metrics.transforms/transform-dimensions) (json/encode dims)))

(deftest ^:parallel transform-dimensions-out-normalizes-test
  (testing ":out keywordizes type values on stored kebab-case rows"
    (let [dim-id (str (random-uuid))
          [dim]  (dimensions-out [{:id               dim-id
                                   :name             "category"
                                   :display-name     "Category"
                                   :effective-type   "type/Text"
                                   :semantic-type    "type/Category"
                                   :has-field-values "list"
                                   :status           "status/active"
                                   :sources          [{:type "field" :field-id 1}]}])]
      (is (= {:id               dim-id
              :name             "category"
              :display-name     "Category"
              :effective-type   :type/Text
              :semantic-type    :type/Category
              :has-field-values :list
              :status           :status/active
              :sources          [{:type :field :field-id 1}]}
             dim)))))
