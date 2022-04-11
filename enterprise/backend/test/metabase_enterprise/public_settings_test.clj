(ns metabase-enterprise.public-settings-test
  (:require [clojure.test :refer :all]
            [metabase.public-settings :as public-settings]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-turn-off-password-login-with-jwt-enabled
  (tu/with-temporary-setting-values [jwt-enabled               true
                                     jwt-identity-provider-uri "example.com"
                                     jwt-shared-secret         "0123456789012345678901234567890123456789012345678901234567890123"
                                     enable-password-login true]
    (public-settings/enable-password-login false)
    (is (= false
           (public-settings/enable-password-login)))))
