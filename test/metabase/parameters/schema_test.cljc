(ns metabase.parameters.schema-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.parameters.schema :as parameters.schema]))

(deftest ^:parallel default-to-type-text-test
  (is (= {:id "x", :type :text}
         (parameters.schema/normalize-parameter {:id "x"}))))

(deftest ^:parallel normalize-parameter-from-json-test
  (is (= {:type :text, :id "e7f8ca", :name "variable", :slug "foo_bar", :value 15, :values_source_type :card}
         (parameters.schema/normalize-parameter
          {"id" "e7f8ca", "name" "variable", "slug" "foo_bar", "type" "text", "value" 15, "values_source_type" "card"}))))
