(ns metabase.lib.schema.template-tag-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli.registry :as mr]))

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

(deftest ^:parallel normalize-template-tags-seq-test
  (testing "the canonical sequence form is idempotent"
    (let [tags [{:type :text, :name "a", :display-name "A", :id "id-a"}
                {:type :number, :name "b", :display-name "B", :id "id-b"}]]
      (is (= tags
             (lib/normalize ::lib.schema.template-tag/template-tags tags)))))
  (testing "the transitional [name tag] pairs form normalizes to the sequence"
    (is (= [{:type :text, :name "a", :display-name "A", :id "id-a"}]
           (lib/normalize ::lib.schema.template-tag/template-tags
                          [["a" {:type :text, :display-name "A", :id "id-a"}]]))))
  (testing "the legacy associative-map form is normalized to the sequence (map iteration order)"
    (is (= [{:type :text, :name "x", :display-name "X", :id "id-x"}]
           (lib/normalize ::lib.schema.template-tag/template-tags
                          {"x" {:type :text, :name "x", :display-name "X", :id "id-x"}}))))
  (testing "empty/nil normalize to nil (filtered out by the stage schema)"
    (is (nil? (lib/normalize ::lib.schema.template-tag/template-tags {})))
    (is (nil? (lib/normalize ::lib.schema.template-tag/template-tags [])))
    (is (nil? (lib/normalize ::lib.schema.template-tag/template-tags nil))))
  (testing "duplicate names are dropped in favor of the first occurrence"
    (is (= [{:type :text, :name "x", :display-name "X", :id "first"}]
           (lib/normalize ::lib.schema.template-tag/template-tags
                          [{:type :text, :name "x", :display-name "X", :id "first"}
                           {:type :text, :name "x", :display-name "X", :id "second"}])))))

(deftest ^:parallel validate-template-tags-seq-test
  (testing "two tags sharing a :name are invalid"
    (is (me/humanize (mr/explain ::lib.schema.template-tag/template-tags
                                 [{:type :text, :name "x", :display-name "X", :id "id-1"}
                                  {:type :text, :name "x", :display-name "X", :id "id-2"}])))))
