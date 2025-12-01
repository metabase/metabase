(ns metabase.lib.schema.template-tag-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel normalize-template-tag-remove-dimension-test
  (testing "Normalization should be able to remove :dimension from template tag types where it is disallowed"
    (is (= {:name         "number_comma"
            :display-name "Number Comma"
            :type         :number}
           (lib/normalize
            ::lib.schema.template-tag/template-tag
            {:name         "number_comma"
             :display-name "Number Comma"
             :type         "number"
             :dimension    ["field" {"lib/uuid" "eef18794-7d5f-409c-8017-00d306f9aec3"} 1]})))))

(deftest ^:parallel normalize-legacy-ref-test
  (are [x] (=? {:dimension [:field {:lib/uuid string?} 100]}
               (lib/normalize ::lib.schema.template-tag/field-filter {:type :dimension, :dimension x}))
    [:field 100]
    [:field-id 100]
    [:field 100 nil]))

(deftest ^:parallel fix-names-test
  (testing "names in the map values need to match keys in the map"
    (is (=? {"time-unit" {:name         "time-unit"
                          :display-name "id"
                          :type         :temporal-unit
                          :dimension    [:field {:lib/uuid string?} 1]}}
            (lib/normalize ::lib.schema.template-tag/template-tag-map
                           {"time-unit" {:name         "id"
                                         :display-name "id"
                                         :type         :temporal-unit
                                         :dimension    [:field 1]}})))))

(deftest ^:parallel normalize-template-tag-options-map-test
  (is (= {:default      nil
          :id           "f7672b4d-1e84-1fa8-bf02-b5e584cd4535"
          :name         "state"
          :display-name "State"
          :type         :dimension
          :options      {:case-sensitive false}
          :dimension    [:field
                         {:base-type :type/Text, :lib/uuid "15f3559e-5c7a-4684-9a7a-d906da2eaf61", :effective-type :type/Text}
                         1]
          :widget-type  :string/contains}
         (lib/normalize ::lib.schema.template-tag/template-tag
                        {:default      nil
                         :id           "f7672b4d-1e84-1fa8-bf02-b5e584cd4535"
                         :name         "state"
                         :display-name "State"
                         :type         :dimension
                         :options      {"case-sensitive" false}
                         :dimension    [:field
                                        {:base-type :type/Text, :lib/uuid "15f3559e-5c7a-4684-9a7a-d906da2eaf61", :effective-type :type/Text}
                                        1]
                         :widget-type  :string/contains}))))
