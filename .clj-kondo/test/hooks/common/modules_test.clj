(ns hooks.common.modules-test
  (:require
   [clojure.test :refer :all]
   [hooks.common.modules]))

(deftest ^:parallel module-test
  (are [symb expected] (= expected
                          (hooks.common.modules/module symb))
    'metabase.qp.middleware.wow        'qp
    'metabase-enterprise.whatever.core 'enterprise/whatever))
