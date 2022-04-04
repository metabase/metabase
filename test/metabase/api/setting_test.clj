(ns metabase.api.setting-test
  (:require [clojure.test :refer :all]
            [metabase.models.setting-test :refer [test-sensitive-setting test-setting-1 test-setting-2 test-setting-3
                                                  test-user-local-allowed-setting test-user-local-only-setting]]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [schema.core :as s]))

(use-fixtures :once (fixtures/initialize :db))

;; ## Helper Fns
(defn- fetch-test-settings
  "Fetch all test settings."
  []
  (for [setting (mt/user-http-request :crowberto :get 200 "setting")
        :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
    setting))

(defn- fetch-setting
  "Fetch a single setting."
  ([setting-name status]
   (fetch-setting :crowberto setting-name status))

  ([user setting-name status]
   (mt/user-http-request user :get status (format "setting/%s" (name setting-name)))))

(deftest fetch-setting-test
  (testing "GET /api/setting"
    (testing "Check that we can fetch all Settings, except `:visiblity :internal` ones"
      (test-setting-1 nil)
      (test-setting-2 "FANCY")
      (test-setting-3 "oh hai")         ; internal setting that should not be returned
      (is (= [{:key            "test-setting-1"
               :value          nil
               :is_env_setting false
               :env_name       "MB_TEST_SETTING_1"
               :description    "Test setting - this only shows up in dev (1)"
               :default        nil}
              {:key            "test-setting-2"
               :value          "FANCY"
               :is_env_setting false
               :env_name       "MB_TEST_SETTING_2"
               :description    "Test setting - this only shows up in dev (2)"
               :default        "[Default Value]"}]
             (fetch-test-settings))))

    (testing "Check that non-superusers are denied access"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "setting")))))

  (testing "GET /api/setting/:key"
    (testing "Test that we can fetch a single setting"
      (test-setting-2 "OK!")
      (is (= "OK!"
             (fetch-setting :test-setting-2 200))))

    (testing "Check that non-superusers cannot fetch a single setting if it is not user-local"
      (is (= "You don't have permissions to do that."
             (fetch-setting :rasta :test-setting-2 403))))))

(deftest fetch-calculated-settings-test
  (testing "GET /api/setting"
    (testing "Should return the correct `:value` for Settings with no underlying DB/env var value"
      (premium-features-test/with-premium-features #{:embedding}
        (is (schema= {:key            (s/eq "hide-embed-branding?")
                      :value          (s/eq true)
                      :is_env_setting (s/eq false)
                      :env_name       (s/eq "MB_HIDE_EMBED_BRANDING")
                      :default        (s/eq nil)
                      s/Keyword       s/Any}
                     (some
                      (fn [{setting-name :key, :as setting}]
                        (when (= setting-name "hide-embed-branding?")
                          setting))
                      (mt/user-http-request :crowberto :get 200 "setting"))))))))

(deftest fetch-internal-settings-test
  (testing "Test that we can't fetch internal settings"
    (test-setting-3 "NOPE!")
    (is (= "Setting :test-setting-3 is internal"
           (:message (fetch-setting :test-setting-3 500))))))

(deftest update-settings-test
  (testing "PUT /api/setting/:key"
    (mt/user-http-request :crowberto :put 204 "setting/test-setting-1" {:value "NICE!"})
    (is (= "NICE!"
           (test-setting-1))
        "Updated setting should be visible from setting getter")

    (is (= "NICE!"
           (fetch-setting :test-setting-1 200))
        "Updated setting should be visible from API endpoint")

    (testing "Check non-superuser can't set a Setting that is not user-local"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting/test-setting-1" {:value "NICE!"}))))

    (testing "Check that a generic 403 error is returned if a non-superuser tries to set a Setting that doesn't exist"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting/bad-setting" {:value "NICE!"}))))))

(deftest fetch-sensitive-setting-test
  (testing "Sensitive settings should always come back obfuscated"
    (testing "GET /api/setting/:name"
      (test-sensitive-setting "ABCDEF")
      (is (= "**********EF"
             (fetch-setting :test-sensitive-setting 200))))

    (testing "GET /api/setting"
      (test-sensitive-setting "GHIJKLM")
      (is (= {:key            "test-sensitive-setting"
              :value          "**********LM"
              :is_env_setting false
              :env_name       "MB_TEST_SENSITIVE_SETTING"
              :description    "This is a sample sensitive Setting."
              :default        nil}
             (some (fn [{setting-name :key, :as setting}]
                     (when (= setting-name "test-sensitive-setting")
                       setting))
                   (mt/user-http-request :crowberto :get 200 "setting")))))))

(deftest set-sensitive-setting-test
  (testing (str "Setting the Setting via an endpoint should still work as expected; the normal getter functions "
                "should *not* obfuscate sensitive Setting values -- that should be done by the API")
    (mt/user-http-request :crowberto :put 204 "setting/test-sensitive-setting" {:value "123456"})
    (is (= "123456"
           (test-sensitive-setting))))

  (testing "Attempts to set the Setting to an obfuscated value should be ignored"
    (testing "PUT /api/setting/:name"
      (test-sensitive-setting "123456")
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting/test-sensitive-setting" {:value "**********56"})))
      (is (= "123456"
             (test-sensitive-setting))))

    (testing "PUT /api/setting"
      (test-sensitive-setting "123456")
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting" {:test-sensitive-setting "**********56"})))
      (is (= "123456"
             (test-sensitive-setting))))))

;; there are additional tests for this functionality in `metabase.model.setting-test/set-many!-test`, since this API
;; endpoint is just a thin wrapper around that function
(deftest update-multiple-settings-test
  (testing "PUT /api/setting/"
    (testing "admin should be able to update multiple settings at once"
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting" {:test-setting-1 "ABC", :test-setting-2 "DEF"})))
      (is (= "ABC"
             (test-setting-1)))
      (is (= "DEF"
             (test-setting-2))))

    (testing "non-admin should not be able to update multiple settings at once if any of them are not user-local"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting" {:test-setting-1 "GHI", :test-setting-2 "JKL"})))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting" {:test-setting-1 "GHI", :test-user-local-allowed-setting "JKL"}))))))

(defn- fetch-user-local-test-settings [user]
  (for [setting (mt/user-http-request user :get 200 "setting")
        :when   (re-find #"^test-user-local.*setting$" (name (:key setting)))]
    setting))

(defn- set-initial-user-local-values []
  (mt/with-current-user (mt/user->id :crowberto)
    (test-user-local-only-setting "ABC")
    (test-user-local-allowed-setting "ABC"))
  (mt/with-current-user (mt/user->id :rasta)
    (test-user-local-only-setting "DEF")
    (test-user-local-allowed-setting "DEF")))

(defn- clear-user-local-values []
  (mt/with-current-user (mt/user->id :crowberto)
    (test-user-local-only-setting nil)
    (test-user-local-allowed-setting nil))
  (mt/with-current-user (mt/user->id :rasta)
    (test-user-local-only-setting nil)
    (test-user-local-allowed-setting nil)))

(deftest user-local-settings-test
  (testing "GET /api/setting/"
    (testing "admins can list all settings and see user-local values included"
      (set-initial-user-local-values)
      (is (= [{:key "test-user-local-allowed-setting"
               :value "ABC" ,
               :is_env_setting false,
               :env_name "MB_TEST_USER_LOCAL_ALLOWED_SETTING",
               :description "test Setting",
               :default nil}
              {:key "test-user-local-only-setting",
               :value "ABC" ,
               :is_env_setting false,
               :env_name "MB_TEST_USER_LOCAL_ONLY_SETTING",
               :description "test Setting",
               :default nil}]
             (fetch-user-local-test-settings :crowberto)))
      (clear-user-local-values)))

  (testing "GET /api/setting/:key"
    (testing "should return the user-local value of a user-local setting"
      (set-initial-user-local-values)
      (is (= "ABC"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-only-setting")))
      (is (= "ABC"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-allowed-setting")))

      (is (= "DEF"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-only-setting")))
      (is (= "DEF"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-allowed-setting")))
      (clear-user-local-values)))

  (testing "PUT /api/setting/:key"
    (testing "should update the user-local value of a user-local setting"
      (set-initial-user-local-values)
      (mt/user-http-request :crowberto :put 204 "setting/test-user-local-only-setting" {:value "GHI"})
      (is (= "GHI"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-only-setting")))
      (mt/user-http-request :crowberto :put 204 "setting/test-user-local-allowed-setting" {:value "JKL"})
      (is (= "JKL"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-allowed-setting")))

      (mt/user-http-request :rasta :put 204 "setting/test-user-local-only-setting" {:value "MNO"})
      (is (= "MNO"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-only-setting")))
      (mt/user-http-request :rasta :put 204 "setting/test-user-local-allowed-setting" {:value "PQR"})
      (is (= "PQR"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-allowed-setting")))
      (clear-user-local-values)))

  (testing "PUT /api/setting"
    (testing "can updated multiple user-local settings at once"
      (set-initial-user-local-values)
      (mt/user-http-request :crowberto :put 204 "setting" {:test-user-local-only-setting    "GHI"
                                                           :test-user-local-allowed-setting "JKL"})
      (is (= "GHI"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-only-setting")))
      (is (= "JKL"
             (mt/user-http-request :crowberto :get 200 "setting/test-user-local-allowed-setting")))

      (mt/user-http-request :rasta :put 204 "setting" {:test-user-local-only-setting    "MNO"
                                                       :test-user-local-allowed-setting "PQR"})
      (is (= "MNO"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-only-setting")))
      (is (= "PQR"
             (mt/user-http-request :rasta :get 200 "setting/test-user-local-allowed-setting")))
      (clear-user-local-values))

    (testing "if a non-admin tries to set multiple settings and any aren't user-local, none are updated"
      (set-initial-user-local-values)
      (test-setting-1 "ABC")
      (mt/user-http-request :rasta :put 403 "setting" {:test-user-local-only-setting "MNO"
                                                       :test-setting-1               "PQR"})
      (is (= "DEF" (mt/with-current-user (mt/user->id :rasta)
                     (test-user-local-only-setting))))
      (is (= "ABC" (test-setting-1))))))
