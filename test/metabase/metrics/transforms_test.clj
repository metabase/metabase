(ns metabase.metrics.transforms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metrics.transforms :as metrics.transforms]
   [metabase.util.json :as json]))

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
