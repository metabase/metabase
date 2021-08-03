(ns metabase.plugins.driver-deprecation-test
  (:require [clojure.test :refer :all]
            [metabase.models.setting :as setting]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :plugins))

(deftest driver-deprecation-test
  (mt/test-driver :driver-deprecation-test-legacy
    (is (= :driver-deprecation-test-new
           (get-in (setting/properties :public) [:engines :driver-deprecation-test-legacy :superseded-by])))))
