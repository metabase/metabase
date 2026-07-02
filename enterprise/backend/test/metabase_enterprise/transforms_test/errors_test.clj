(ns metabase-enterprise.transforms-test.errors-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.transforms-test.api.util :as api-util]
   [metabase-enterprise.transforms-test.errors :as errors]))

(deftest status-map-keys-are-declared-error-types-test
  (testing "every :error-type in the HTTP status map is a declared error-type"
    (is (empty? (set/difference (set (keys api-util/test-run-error-http-status))
                                errors/all))
        "an entry in test-run-error-http-status maps a keyword absent from errors/all — likely a typo or a renamed/removed error-type")))
