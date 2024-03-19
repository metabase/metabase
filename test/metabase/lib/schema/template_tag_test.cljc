(ns metabase.lib.schema.template-tag-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]))

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
