(ns metabase.lib.schema.template-tag-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util :as lib.util]
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

(deftest ^:parallel normalize-template-tags-map-to-list-test
  (testing "names in the map values need to match keys in the map"
    (is (=? [{:name         "time_unit"
              :display-name "id"
              :type         :temporal-unit
              :dimension    [:field {:lib/uuid string?} 1]}]
            (lib/normalize ::lib.schema.template-tag/template-tags
                           {"time_unit" {:name         "id"
                                         :display-name "id"
                                         :type         :temporal-unit
                                         :dimension    [:field 1]}})))))

(deftest ^:parallel validate-template-tag-name-test
  (testing "valid tag names"
    (are [tag-name] (nil? (me/humanize (mr/explain ::lib.schema.template-tag/name tag-name)))
      "var_abc"
      "snippet: x"
      "#123"
      "#123-card-slug")))

(deftest ^:parallel validate-invalid-template-tag-name-test
  (testing "invalid tag names"
    (are [tag-name expected-error] (= [expected-error]
                                      (me/humanize (mr/explain ::lib.schema.template-tag/name tag-name)))
      "var-abc"
      "Variable template tag names can only contain letters, numbers, underscores, or periods"

      "snippet:x"
      (str "Snippet template tag names must match the format 'snippet: <name>' where <name> is any character besides"
           " '}'; the last character cannot be a space")

      ;; ID cannot start with a zero
      "#0123"
      "Card template tag names must match the format '#<card-id>' or '#<card-id>-<slug>'"

      "#123_card"
      "Card template tag names must match the format '#<card-id>' or '#<card-id>-<slug>'")))

(deftest ^:parallel normalize-template-tag-name-test
  (are [tag-name normalized] (= normalized
                                (lib/normalize ::lib.schema.template-tag/name tag-name))
    " snippet:  x " "snippet: x"
    " var_abc "     "var_abc"
    "var-abc"       "var_abc"
    " #123-card "   "#123-card"
    "#0123-card"    "#123-card"))

(deftest ^:parallel normalize-snippet-template-tag-name-test
  (are [input] (= {:type         :snippet
                   :name         "snippet: My Snippet"
                   :snippet-name "My Snippet"}
                  (lib/normalize ::lib.schema.template-tag/template-tag input))
    ;; missing `:name`
    {:type         :snippet
     :snippet-name "My Snippet"}
    ;; missing `:snippet-name`
    {:type :snippet
     :name "snippet: My Snippet"}
    ;; has both, but `:name` is wrong
    {:type         :snippet
     :name         "My Snippet"
     :snippet-name "My Snippet"}))

(deftest ^:parallel normalize-card-template-tag-name-test
  (are [input] (= {:type    :card
                   :card-id 1
                   :name    "#1"}
                  (lib/normalize ::lib.schema.template-tag/template-tag input))
    ;; missing `:card-id`
    {:type    :card
     :name    "#1"}
    ;; missing `:name`
    {:type    :card
     :card-id 1}
    ;; has both, but `:name` is wrong
    {:type    :card
     :card-id 1
     :name    "#400"}))

(deftest ^:parallel template-tag-distinct-names-test
  (testing "multiple template tags with the same :name"
    (let [tag {:default      nil
               :id           "f7672b4d-1e84-1fa8-bf02-b5e584cd4535"
               :name         "state"
               :display-name "State"
               :type         :dimension
               :options      {:case-sensitive false}
               :dimension    [:field
                              {:base-type :type/Text, :lib/uuid "15f3559e-5c7a-4684-9a7a-d906da2eaf61", :effective-type :type/Text}
                              1]
               :widget-type  :string/contains}]
      (testing "Validation should fail if there are duplicates"
        (is (= ["Template tags must have distinct :names"]
               (me/humanize (mr/explain ::lib.schema.template-tag/template-tags [tag tag])))))
      (testing "Normalization should remove duplicates"
        (is (= [tag]
               (lib/normalize ::lib.schema.template-tag/template-tags [tag tag])))))))
