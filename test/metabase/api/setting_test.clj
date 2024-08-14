(ns ^:mb/once metabase.api.setting-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common.validation :as validation]
   [metabase.driver.h2 :as h2]
   [metabase.models :refer [Database]]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.setting-test :as models.setting-test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.i18n :refer [deferred-tru]]))

(comment h2/keep-me)

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defsetting test-api-setting-boolean
  (deferred-tru "Test setting - this only shows up in dev (3)")
  :visibility :public
  :type :boolean)

(defsetting test-api-setting-double
  (deferred-tru "Test setting - this only shows up in dev (3)")
  :visibility :public
  :type :double)

(defsetting test-api-setting-integer
  (deferred-tru "Test setting - this only shows up in dev (3)")
  :visibility :public
  :type :integer)

(defsetting test-settings-manager-visibility
  (deferred-tru "Setting to test the `:settings-manager` visibility level. This only shows up in dev.")
  :visibility :settings-manager)

;; ## Helper Fns
(defn- fetch-test-settings
  "Fetch the provided settings using the API. Settings not present in the response are ignored."
  ([setting-names]
   (fetch-test-settings :crowberto setting-names))

  ([user setting-names]
   (for [setting (mt/user-http-request user :get 200 "setting")
         :when   (.contains ^clojure.lang.PersistentVector (vec setting-names)
                            (keyword (:key setting)))]
     setting)))

(defn- fetch-setting
  "Fetch a single setting."
  ([setting-name status]
   (fetch-setting :crowberto setting-name status))

  ([user setting-name status]
   (mt/user-http-request user :get status (format "setting/%s" (name setting-name)))))

(defn- do-with-mocked-settings-manager-access
  [f]
  (with-redefs [setting/has-advanced-setting-access?        (constantly true)
                validation/check-has-application-permission (constantly true)]
    (f)))

(defmacro ^:private with-mocked-settings-manager-access
  "Runs `body` with the approrpiate functions redefined to give the current user settings manager permissions."
  [& body]
  `(do-with-mocked-settings-manager-access (fn [] ~@body)))

(deftest fetch-setting-test
  (testing "GET /api/setting"
    (testing "Check that we can fetch all Settings as an admin, except `:visiblity :internal` ones"
      (models.setting-test/test-setting-1! nil)
      (models.setting-test/test-setting-2! "FANCY")
      (models.setting-test/test-setting-3! "oh hai") ; internal setting that should not be returned
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
             (fetch-test-settings [:test-setting-1 :test-setting-2 :test-setting-3]))))

    (testing "Check that non-admin setting managers can fetch Settings with `:visibility :settings-manager`"
      (test-settings-manager-visibility! nil)
      (with-mocked-settings-manager-access
        (is (= [{:key "test-settings-manager-visibility",
                 :value nil,
                 :is_env_setting false,
                 :env_name "MB_TEST_SETTINGS_MANAGER_VISIBILITY",
                 :description "Setting to test the `:settings-manager` visibility level. This only shows up in dev.",
                 :default nil}]
               (fetch-test-settings :rasta [:test-setting-1 :test-settings-manager-visibility])))))

    (testing "Check that non-admins are denied access"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "setting")))))

  (testing "GET /api/setting/:key"
    (testing "Test that admins can fetch a single Setting"
      (models.setting-test/test-setting-2! "OK!")
      (is (= "OK!"
             (fetch-setting :test-setting-2 200))))

    (testing "Test that non-admin setting managers can fetch a single Setting if it has `:visibility :settings-manager`."
      (test-settings-manager-visibility! "OK!")
      (with-mocked-settings-manager-access
        (is (= "OK!" (fetch-setting :test-settings-manager-visibility 200)))))

    (testing "Check that non-superusers cannot fetch a single Setting if it is not user-local"
      (is (= "You don't have permissions to do that."
             (fetch-setting :rasta :test-setting-2 403))))
    (testing "non-string values work over the api (#20735)"
      ;; n.b. the api will return nil if a setting is its default value.
      (test-api-setting-double! 3.14)
      (is (= 3.14 (fetch-setting :test-api-setting-double 200)))

      (test-api-setting-boolean! true)
      (is (= true (fetch-setting :test-api-setting-boolean 200)))

      (test-api-setting-integer! 42)
      (is (= 42 (fetch-setting :test-api-setting-integer 200))))))

(deftest ^:parallel engines-mark-h2-superseded-test
  (testing "GET /api/setting/:key"
    (testing "H2 should have :superseded-by set so it doesn't show up in the list of available drivers in the UI DB edit forms"
      (is (=? {:driver-name   "H2"
               :superseded-by "deprecated"}
              (:h2 (fetch-setting :engines 200)))))))

(deftest fetch-calculated-settings-test
  (testing "GET /api/setting"
    (testing "Should return the correct `:value` for Settings with no underlying DB/env var value"
      (mt/with-premium-features #{:embedding}
        (is (=? {:key            "hide-embed-branding?"
                 :value          true
                 :is_env_setting false
                 :env_name       "MB_HIDE_EMBED_BRANDING"
                 :default        nil}
                (some
                 (fn [{setting-name :key, :as setting}]
                   (when (= setting-name "hide-embed-branding?")
                     setting))
                 (mt/user-http-request :crowberto :get 200 "setting"))))))))

(deftest fetch-internal-settings-test
  (testing "Test that we can't fetch internal settings"
    (models.setting-test/test-setting-3! "NOPE!")
    (is (= "Setting :test-setting-3 is internal"
           (:message (fetch-setting :test-setting-3 500))))))

(deftest update-settings-test
  (testing "PUT /api/setting/:key"
    (mt/user-http-request :crowberto :put 204 "setting/test-setting-1" {:value "NICE!"})
    (is (= "NICE!"
           (models.setting-test/test-setting-1))
        "Updated setting should be visible from setting getter")

    (is (= "NICE!"
           (fetch-setting :test-setting-1 200))
        "Updated setting should be visible from API endpoint")

    (testing "Check that non-admin setting managers can only update Settings with `:visibility :settings-manager`."
      (with-mocked-settings-manager-access
        (mt/user-http-request :rasta :put 204 "setting/test-settings-manager-visibility" {:value "NICE!"})
        (is (= "NICE!" (fetch-setting :test-settings-manager-visibility 200)))

        (mt/user-http-request :rasta :put 403 "setting/test-setting-1" {:value "Not nice :("})))

    (testing "Check non-superuser can't set a Setting that is not user-local"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting/test-setting-1" {:value "NICE!"}))))

    (testing "Check that a generic 403 error is returned if a non-superuser tries to set a Setting that doesn't exist"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "setting/bad-setting" {:value "NICE!"}))))))

(deftest fetch-sensitive-setting-test
  (testing "Sensitive settings should always come back obfuscated"
    (testing "GET /api/setting/:name"
      (models.setting-test/test-sensitive-setting! "ABCDEF")
      (is (= "**********EF"
             (fetch-setting :test-sensitive-setting 200))))

    (testing "GET /api/setting"
      (models.setting-test/test-sensitive-setting! "GHIJKLM")
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
           (models.setting-test/test-sensitive-setting))))

  (testing "Attempts to set the Setting to an obfuscated value should be ignored"
    (testing "PUT /api/setting/:name"
      (models.setting-test/test-sensitive-setting! "123456")
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting/test-sensitive-setting" {:value "**********56"})))
      (is (= "123456"
             (models.setting-test/test-sensitive-setting))))

    (testing "PUT /api/setting"
      (models.setting-test/test-sensitive-setting! "123456")
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting" {:test-sensitive-setting "**********56"})))
      (is (= "123456"
             (models.setting-test/test-sensitive-setting))))))

(deftest fetch-conditionally-read-only-setting-test
  (testing "GET requests are unaffected by the conditional read-only status"
    (testing "GET /api/session/properties with attached-dwh"
      (mt/with-premium-features #{:attached-dwh}
        (is (=? {:db_id        nil
                 :schema_name  nil
                 :table_prefix nil}
                (:uploads-settings (mt/user-http-request :crowberto :get 200 "session/properties"))))))
    (testing "GET /api/setting with attached-dwh"
      (mt/with-premium-features #{:attached-dwh}
        (is (=? {:db_id        nil
                 :schema_name  nil
                 :table_prefix nil}
                (:value (first (filter (comp #{"uploads-settings"} :key)
                                       (mt/user-http-request :crowberto :get 200 "setting"))))))))
    (testing "GET /api/setting/uploads-settings with attached-dwh"
      (mt/with-premium-features #{:attached-dwh}
        (is (=? {:db_id        nil
                 :schema_name  nil
                 :table_prefix nil}
                (mt/user-http-request :crowberto :get 200 "setting/uploads-settings")))))
    (testing "GET /api/session/properties without attached-dwh"
      (is (=? {:db_id        nil
               :schema_name  nil
               :table_prefix nil}
              (:uploads-settings (mt/user-http-request :crowberto :get 200 "session/properties")))))
    (testing "GET /api/setting without attached-dwh"
      (is (=? {:db_id        nil
               :schema_name  nil
               :table_prefix nil}
              (:value (first (filter (comp #{"uploads-settings"} :key)
                                     (mt/user-http-request :crowberto :get 200 "setting")))))))
    (testing "GET /api/setting/uploads-settings without attached-dwh"
      (is (=? {:db_id        nil
               :schema_name  nil
               :table_prefix nil}
              (mt/user-http-request :crowberto :get 200 "setting/uploads-settings"))))))

(deftest set-conditionally-read-only-setting-test
  (testing "PUT requests are rejected with attached-dwh but permitted without"
    (mt/with-temp [Database {:keys [id]} {:engine :postgres
                                          :name   "The Chosen One"}]
      (testing "PUT /api/setting with attached-dwh"
        (mt/with-premium-features #{:attached-dwh}
          (mt/user-http-request :crowberto :put 403 "setting" {:uploads-settings {:db_id id}}))
        (is (=? {:db_id        nil
                 :schema_name  nil
                 :table_prefix nil}
                (mt/user-http-request :crowberto :get 200 "setting/uploads-settings"))))
      (testing "PUT /api/setting/uploads-settings with attached-dwh"
        (mt/with-premium-features #{:attached-dwh}
          (mt/user-http-request :crowberto :put 403 "setting/uploads-settings" {:value {:db_id id}}))
        (is (=? {:db_id        nil
                 :schema_name  nil
                 :table_prefix nil}
                (mt/user-http-request :crowberto :get 200 "setting/uploads-settings"))))
      (testing "PUT /api/setting without attached-dwh"
        (mt/user-http-request :crowberto :put 204 "setting" {:uploads-settings {:db_id id}})
        (is (=? {:db_id        id
                 :schema_name  nil
                 :table_prefix nil}
                (mt/user-http-request :crowberto :get 200 "setting/uploads-settings"))))
      (testing "PUT /api/setting/uploads-settings without attached-dwh"
        (mt/user-http-request :crowberto :put 204 "setting/uploads-settings" {:value {:db_id id}})
        (is (=? {:db_id        id
                 :schema_name  nil
                 :table_prefix nil}
                (mt/user-http-request :crowberto :get 200 "setting/uploads-settings")))))))

;; there are additional tests for this functionality in [[metabase.models.models.setting-test/set-many!-test]], since
;; this API endpoint is just a thin wrapper around that function
(deftest update-multiple-settings-test
  (testing "PUT /api/setting/"
    (testing "admin should be able to update multiple settings at once"
      (is (= nil
             (mt/user-http-request :crowberto :put 204 "setting" {:test-setting-1 "ABC", :test-setting-2 "DEF"})))
      (is (= "ABC"
             (models.setting-test/test-setting-1)))
      (is (= "DEF"
             (models.setting-test/test-setting-2))))

    (testing "non-admin setting managers should only be able to update multiple settings at once if they have `:visibility :settings-manager`"
      (with-mocked-settings-manager-access
       (is (= nil
              (mt/user-http-request :rasta :put 204 "setting" {:test-settings-manager-visibility "ABC"})))
       (is (= "ABC"
              (test-settings-manager-visibility)))
       (is (= "You don't have permissions to do that."
              (mt/user-http-request :rasta :put 403 "setting" {:test-settings-manager-visibility "GHI", :test-setting-1 "JKL"})))
       (is (= "ABC"
              (test-settings-manager-visibility)))
       (is (= "ABC"
              (models.setting-test/test-setting-1)))))

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
    (models.setting-test/test-user-local-only-setting! "ABC")
    (models.setting-test/test-user-local-allowed-setting! "ABC"))
  (mt/with-current-user (mt/user->id :rasta)
    (models.setting-test/test-user-local-only-setting! "DEF")
    (models.setting-test/test-user-local-allowed-setting! "DEF")))

(defn- clear-user-local-values []
  (mt/with-current-user (mt/user->id :crowberto)
    (models.setting-test/test-user-local-only-setting! nil)
    (models.setting-test/test-user-local-allowed-setting! nil))
  (mt/with-current-user (mt/user->id :rasta)
    (models.setting-test/test-user-local-only-setting! nil)
    (models.setting-test/test-user-local-allowed-setting! nil)))

(deftest user-local-settings-test
  (mt/with-premium-features #{:audit-app}
    (testing "GET /api/setting/"
      (testing "admins can list all settings and see user-local values included"
        (set-initial-user-local-values)
        (is (= [{:key "test-user-local-allowed-setting"
                 :value "ABC" ,
                 :is_env_setting false,
                 :env_name "MB_TEST_USER_LOCAL_ALLOWED_SETTING",
                 :description "test Setting",
                 :default nil}
                {:key "test-user-local-only-audited-setting",
                 :value nil,
                 :is_env_setting false,
                 :env_name "MB_TEST_USER_LOCAL_ONLY_AUDITED_SETTING",
                 :description "Audited user-local setting",
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
        (models.setting-test/test-setting-1! "ABC")
        (mt/user-http-request :rasta :put 403 "setting" {:test-user-local-only-setting "MNO"
                                                         :test-setting-1               "PQR"})
        (is (= "DEF" (mt/with-current-user (mt/user->id :rasta)
                       (models.setting-test/test-user-local-only-setting))))
        (is (= "ABC" (models.setting-test/test-setting-1)))))

    (deftest user-local-settings-underscored-test
      (mt/with-temporary-setting-values [test-setting-1 nil
                                         test-setting-2 nil]
        (testing "setting names can use snake case instead of kebab case: "
          (testing "GET /api/setting/:key"
            (models.setting-test/test-setting-1! "ABC")
            (is (= "ABC" (mt/user-http-request :crowberto :get 200 "setting/test_setting_1"))))

          (testing "PUT /api/setting/:key"
            (mt/user-http-request :crowberto :put 204 "setting/test_setting_1" {:value "DEF"})
            (is (= "DEF" (mt/user-http-request :crowberto :get 200 "setting/test_setting_1"))))

          (testing "PUT /api/setting"
            (mt/user-http-request :crowberto :put 204 "setting" {:test_setting_1 "GHI", :test_setting_2 "JKL"})
            (is (= "GHI" (mt/user-http-request :crowberto :get 200 "setting/test_setting_1")))
            (is (= "JKL" (mt/user-http-request :crowberto :get 200 "setting/test_setting_2")))))))))
