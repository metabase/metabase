(ns metabase.metrics.transforms-test
  (:require
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

(defn- dimensions-out
  "Run `dims` through the `:out` side of [[metrics.transforms/transform-dimensions]] the way a
  Toucan select would: JSON-encode then parse + normalize."
  [dims]
  ((:out metrics.transforms/transform-dimensions) (json/encode dims)))

(deftest ^:parallel transform-dimensions-out-normalizes-test
  (testing ":out keywordizes type values and renames legacy kebab-case keys"
    (let [dim-id (str (random-uuid))
          [dim]  (dimensions-out [{:id               dim-id
                                   :name             "category"
                                   :display-name     "Category"
                                   :effective_type   "type/Text"
                                   :semantic_type    "type/Category"
                                   :has_field_values "list"
                                   :status           "status/active"
                                   :sources          [{:type "field" :field-id 1}]}])]
      (is (= {:id               dim-id
              :name             "category"
              :display_name     "Category"
              :effective_type   :type/Text
              :semantic_type    :type/Category
              :has_field_values :list
              :status           :status/active
              :sources          [{:type :field :field-id 1}]}
             dim)))))
