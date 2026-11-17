(ns hooks.common.modules-test
  (:require
   [clojure.test :refer :all]
   [hooks.common.modules]))

(deftest ^:parallel module-test
  (are [symb expected] (= expected
                          (hooks.common.modules/module {} symb))
    'metabase.qp.middleware.wow        'qp
    'metabase-enterprise.whatever.core 'enterprise/whatever))

(deftest ^:parallel module-dir-test
  (testing "default prefixes, OSS and enterprise"
    (are [module tree expected] (= expected (hooks.common.modules/module-dir {} module tree))
      'lib-be         "src"  "src/metabase/lib_be"
      'lib.schema     "test" "test/metabase/lib/schema"
      'enterprise/sso "src"  "enterprise/backend/src/metabase_enterprise/sso"))
  (testing "a custom :ns-prefix"
    (is (= "enterprise/backend/test/metabase_enterprise/y_z"
           (hooks.common.modules/module-dir '{enterprise/x {:ns-prefix "metabase-enterprise.y-z"}}
                                            'enterprise/x
                                            "test")))))
