(ns metabase-enterprise.sandbox.models.params.chain-filter-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [FieldValues]]
            [metabase.models.params.chain-filter :as chain-filter]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(deftest chain-filter-sandboxed-field-values-test
  (testing "When chain-filter would normally return cached FieldValues (#13832), make sure sandboxing is respected"
    (mt/with-gtaps {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
      (mt/with-temp-vals-in-db FieldValues (u/the-id (db/select-one-id FieldValues :field_id (mt/id :categories :name))) {:values ["Good" "Bad"]}
        (testing "values"
          (is (= ["African" "American"]
                 (mt/$ids (chain-filter/chain-filter %categories.name nil)))))

        (testing "search"
          (is (= ["African" "American"]
                 (mt/$ids (chain-filter/chain-filter-search %categories.name nil "a")))))))))
