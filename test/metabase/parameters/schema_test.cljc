(ns metabase.parameters.schema-test
  (:require
   #?@(:clj [[metabase.api.macros :as api.macros]
             [metabase.util.json :as json]])
   [clojure.test :refer [deftest is testing]]
   [metabase.parameters.schema :as parameters.schema]))

(deftest ^:parallel default-to-type-text-test
  (is (= {:id "x", :type :text}
         (parameters.schema/normalize-parameter {:id "x"}))))

(deftest ^:parallel normalize-parameter-from-json-test
  (is (= {:type :text, :id "e7f8ca", :name "variable", :slug "foo_bar", :value 15, :values_source_type :card}
         (parameters.schema/normalize-parameter
          {"id" "e7f8ca", "name" "variable", "slug" "foo_bar", "type" "text", "value" 15, "values_source_type" "card"}))))

(deftest ^:parallel normalize-parameter-mapping-remove-negative-card-ids
  (testing "Apparently some FE code accidentally sent `card_id -1` and now we have to work around it"
    (is (= {:parameter_id "53bb6214", :target [:variable [:template-tag "id"]]}
           (parameters.schema/normalize-parameter-mapping
            {"parameter_id" "53bb6214", "card_id" -1, "target" ["variable" ["template-tag" "id"]]})))))

(deftest ^:parallel normalize-parameters-without-adding-default-type-test
  (is (= [{:id "x", :target [:dimension [:template-tag "y"]]}]
         (parameters.schema/normalize-parameters-without-adding-default-types [{"id" "x", "target" ["dimension" ["template-tag" "y"]]}]))))

#?(:clj
   (deftest api-parameter-values-decode-strips-extra-keys-test
     (testing "::api.parameter-values decodes a JSON string, normalizes keys, and strips undeclared properties"
       (is (= [{:id "_STATE_" :type :text :target [:variable [:template-tag "state"]] :value "CA"}]
              (api.macros/decode-and-validate-params
               :query ::parameters.schema/api.parameter-values
               (json/encode [{:id     "_STATE_"
                              :type   "text"
                              :target [:variable [:template-tag "state"]]
                              :value  "CA"
                              :a      1
                              :a/b    2}])))))))

#?(:clj
   (deftest api-parameter-values-decode-preserves-nested-options-test
     (testing "nested :options maps survive the JSON-string decode + strip pass with keywordized keys"
       (is (= [{:id      "_STATE_"
                :type    :text
                :target  [:dimension [:template-tag "state"] {:stage-number 1}]
                :value   "CA"
                :options {:case-sensitive false, :include-current true}}]
              (api.macros/decode-and-validate-params
               :query ::parameters.schema/api.parameter-values
               (json/encode [{:id      "_STATE_"
                              :type    "text"
                              :target  ["dimension" ["template-tag" "state"] {"stage-number" 1}]
                              :value   "CA"
                              :options {"case-sensitive" false, "include-current" true}}])))))))
