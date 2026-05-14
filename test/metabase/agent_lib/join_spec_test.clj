(ns metabase.agent-lib.join-spec-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.agent-lib.join-spec :as join-spec]
   [metabase.lib.test-metadata :as meta]))

(deftest parse-join-spec-normalizes-nested-join-wrappers-test
  (let [join-form ["with-join-alias"
                   ["with-join-strategy"
                    ["with-join-fields"
                     ["with-join-conditions"
                      ["join-clause" ["table" (meta/id :categories)]]
                      [["="
                        ["field" (meta/id :venues :category-id)]
                        ["field" (meta/id :categories :id)]]]]
                     "none"]
                    "left-join"]
                   "cat"]
        expected  {:target-table-id (meta/id :categories)
                   :conditions      [[(meta/id :venues :category-id)
                                      (meta/id :categories :id)]]
                   :fields-mode     "none"
                   :strategy        "left-join"
                   :alias           "cat"}]
    (is (= expected (join-spec/parse-join-spec join-form)))))

(deftest join-fields-mode-helpers-test
  (is (true? (join-spec/no-explicit-join-fields? nil)))
  (is (true? (join-spec/no-explicit-join-fields? "none")))
  (is (false? (join-spec/no-explicit-join-fields? "all")))
  (is (true? (join-spec/implicit-join-compatible-fields-mode? "all")))
  (is (false? (join-spec/implicit-join-compatible-fields-mode? [["field" 1]]))))
