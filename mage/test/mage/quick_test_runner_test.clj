(ns mage.quick-test-runner-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.quick-test-runner :as qtr]))

(deftest only-edn-test
  (testing "quotes symbols for nrepl eval"
    (is (= "'[metabase.foo-test]"
           (#'qtr/only-edn ['metabase.foo-test])))
    (is (= "'[\"test/metabase/db\"]"
           (#'qtr/only-edn ["test/metabase/db"])))
    (is (= "'[metabase.foo-test/bar-test \"test/metabase/db\"]"
           (#'qtr/only-edn ['metabase.foo-test/bar-test "test/metabase/db"])))))

(deftest normalize-test-arg-test
  (testing "namespace args"
    (is (= 'metabase.foo-test
           (#'qtr/normalize-test-arg "metabase.foo-test")))
    (is (= 'metabase-enterprise.transforms.models-test/table-with-db-and-fields-hydration-test
           (#'qtr/normalize-test-arg
            "metabase-enterprise.transforms.models-test/table-with-db-and-fields-hydration-test")))
    (is (= 'hooks.foo-test
           (#'qtr/normalize-test-arg "hooks.foo-test")))
    (is (= 'metabase.foo-test
           (#'qtr/normalize-test-arg 'metabase.foo-test))))
  (testing "path args"
    (is (= "test/metabase/db"
           (#'qtr/normalize-test-arg "test/metabase/db")))
    (is (= "test/metabase/db/sync_test.clj"
           (#'qtr/normalize-test-arg "test/metabase/db/sync_test.clj")))))

(deftest check-arg-test
  (testing "accepted variants"
    (is (#'qtr/check-arg "metabase.foo-test"))
    (is (#'qtr/check-arg "metabase.foo-test/bar-test"))
    (is (#'qtr/check-arg "hooks.foo-test"))
    (is (#'qtr/check-arg "test/metabase/db"))
    (is (#'qtr/check-arg "test/metabase/db/sync_test.clj"))
    (is (#'qtr/check-arg 'metabase.foo-test)))
  (testing "rejected variants"
    (is (not (#'qtr/check-arg "foo")))))
