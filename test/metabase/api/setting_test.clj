(ns metabase.api.setting-test
  (:require [clojure.test :refer :all]
            [metabase.models.setting-test :refer [test-sensitive-setting test-setting-1 test-setting-2 test-setting-3]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;; ## Helper Fns
(defn- fetch-test-settings  []
  (for [setting ((mt/user->client :crowberto) :get 200 "setting")
        :when   (re-find #"^test-setting-\d$" (name (:key setting)))]
    setting))

(defn- fetch-setting [setting-name status]
  ((mt/user->client :crowberto) :get status (format "setting/%s" (name setting-name))))

(deftest fetch-setting-test
  (testing "GET /api/setting"
    (testing "Check that we can fetch all Settings, except `:visiblity :internal` ones"
      (test-setting-1 nil)
      (test-setting-2 "FANCY")
      (test-setting-3 "oh hai")         ; internal setting that should not be returned
      (is (= [{:key            "test-setting-1"
               :value          nil
               :is_env_setting true
               :env_name       "MB_TEST_SETTING_1"
               :description    "Test setting - this only shows up in dev (1)"
               :default        "Using value of env var $MB_TEST_SETTING_1"}
              {:key            "test-setting-2"
               :value          "FANCY"
               :is_env_setting false
               :env_name       "MB_TEST_SETTING_2"
               :description    "Test setting - this only shows up in dev (2)"
               :default        "[Default Value]"}]
             (fetch-test-settings))))

    (testing "Check that non-superusers are denied access"
      (is (= "You don't have permissions to do that."
             ((mt/user->client :rasta) :get 403 "setting")))))

  (testing "GET /api/setting/:key"
    (testing "Test that we can fetch a single setting"
      (test-setting-2 "OK!")
      (is (= "OK!"
             (fetch-setting :test-setting-2 200))))))

(deftest fetch-internal-settings-test
  (testing "Test that we can't fetch internal settings"
    (test-setting-3 "NOPE!")
    (is (= "Setting :test-setting-3 is internal"
           (mt/suppress-output
             (:message (fetch-setting :test-setting-3 500)))))))

(deftest update-settings-test
  (testing "PUT /api/setting/:key"
    ((mt/user->client :crowberto) :put 204 "setting/test-setting-1" {:value "NICE!"})
    (is (= "NICE!"
           (test-setting-1))
        "Updated setting should be visible from setting getter")

    (is (= "NICE!"
           (fetch-setting :test-setting-1 200))
        "Updated setting should be visible from API endpoint")

    (testing "Check non-superuser can't set a Setting"
      (= "You don't have permissions to do that."
         ((mt/user->client :rasta) :put 403 "setting/test-setting-1" {:value "NICE!"})))))

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
                   ((mt/user->client :crowberto) :get 200 "setting")))))))

(deftest set-sensitive-setting-test
  (testing (str "Setting the Setting via an endpoint should still work as expected; the normal getter functions "
                "should *not* obfuscate sensitive Setting values -- that should be done by the API")
    ((mt/user->client :crowberto) :put 204 "setting/test-sensitive-setting" {:value "123456"})
    (is (= "123456"
           (test-sensitive-setting))))

  (testing "Attempts to set the Setting to an obfuscated value should be ignored"
    (testing "PUT /api/setting/:name"
      (test-sensitive-setting "123456")
      (is (= nil
             ((mt/user->client :crowberto) :put 204 "setting/test-sensitive-setting" {:value "**********56"})))
      (is (= "123456"
             (test-sensitive-setting))))

    (testing "PUT /api/setting"
      (test-sensitive-setting "123456")
      (is (= nil
             ((mt/user->client :crowberto) :put 204 "setting" {:test-sensitive-setting "**********56"})))
      (is (= "123456"
             (test-sensitive-setting))))))

;; there are additional tests for this functionality in `metabase.model.setting-test/set-many!-test`, since this API
;; endpoint is just a thin wrapper around that function
(deftest update-multiple-settings-test
  (testing "PUT /api/setting/"
    (testing "should be able to update multiple settings at once"
      (is (= nil
             ((mt/user->client :crowberto) :put 204 "setting" {:test-setting-1 "ABC", :test-setting-2 "DEF"})))
      (is (= "ABC"
             (test-setting-1)))
      (is (= "DEF"
             (test-setting-2))))))
