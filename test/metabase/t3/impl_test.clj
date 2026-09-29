(ns metabase.t3.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.t3.impl :as t3]
   [metabase.util.malli.registry :as mr]))

(deftest requires-schema
  (testing "Requiring one query is valid"
    (is (true? (mr/validate t3/RequireSchema
                            '[metabase.t3.user_q user-by-id]))))
  (testing "Requiring two queries is valid"
    (is (true? (mr/validate t3/RequireSchema
                            '[metabase.t3.user_q user-by-id abc]))))
  (testing "Require with no ns part is invalid"
    (is (false? (mr/validate t3/RequireSchema '[]))))
  (testing "Requiring without any actual queries imported is allowed"
    (is (true? (mr/validate t3/RequireSchema '[metabase.t3.user_q]))))
  (testing "Must use symbols"
    (is (false? (mr/validate t3/RequireSchema '["abc"]))))
  (testing "Cannot use namespaced symbols"
    (is (false? (mr/validate t3/RequireSchema '[a/b])))))

(deftest column-select-schema-test
  (let [schema (t3/table-spec->schema '{:apple {:columns [taste shape]}})]
    (testing "Can select columns from table"
      (is (mr/validate schema [:apple [:taste]])))
    (testing "Cannot select columns not in the table"
      (is (not (mr/validate schema [:apple [:a]]))))
    (testing "Optionally can provide attributes"
      (is (mr/validate schema [:apple {} [:taste]])))
    (testing "Cannot select zero columns"
      (is (not (mr/validate schema [:apple []])))
      (is (not (mr/validate schema [:apple {} []]))))
    (testing "Can select multiple columns"
      (is (mr/validate schema [:apple [:taste :shape]]))
      (is (mr/validate schema [:apple {} [:taste :shape]])))))
