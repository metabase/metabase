(ns metabase-enterprise.library-branching.settings-test
  (:require
   [clojure.test :refer :all]
   ;; loads the settings of every enterprise module, as at startup
   [metabase-enterprise.core.init]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest library-branching-enabled-default-test
  (testing "library-branching-enabled is false until an admin sets it"
    (mt/with-temporary-setting-values [:library-branching-enabled nil]
      (is (false? (setting/get :library-branching-enabled)))
      (mt/user-http-request :crowberto :put 204 "setting/library-branching-enabled" {:value true})
      (is (true? (setting/get :library-branching-enabled))))))

(deftest library-branching-enabled-admin-only-test
  (mt/with-temporary-setting-values [:library-branching-enabled nil]
    (testing "an admin reads the setting"
      (is (contains? (mt/user-http-request :crowberto :get 200 "session/properties") :library-branching-enabled)))
    (testing "a user who is not an admin can neither read nor write the setting"
      (is (not (contains? (mt/user-http-request :rasta :get 200 "session/properties") :library-branching-enabled)))
      (mt/user-http-request :rasta :put 403 "setting/library-branching-enabled" {:value true})
      (is (false? (setting/get :library-branching-enabled))))))
