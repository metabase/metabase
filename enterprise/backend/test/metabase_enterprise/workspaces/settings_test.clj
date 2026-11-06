(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      (try
                        (thunk)
                        (finally
                          (ws/clear-instance-workspace!)))))

(deftest workspace-mode?-false-when-setting-empty-test
  (testing "workspace-mode? is false when no :workspace section has been loaded"
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))))

(deftest workspace-mode?-true-when-setting-populated-test
  (testing "workspace-mode? flips to true once a workspace config has been set"
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))
    (ws/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws/workspace-mode?)))))

(deftest workspace-mode?-flips-back-to-false-on-clear-test
  (testing "workspace-mode? returns to false after clear-instance-workspace!"
    (ws/set-instance-workspace! {:name "Acme" :databases {}})
    (is (true? (ws/workspace-mode?)))
    (ws/clear-instance-workspace!)
    (is (false? (ws/workspace-mode?)))))

(deftest allow-data-studio-in-iframe-test
  (testing "off by default"
    (is (false? (ws.settings/allow-data-studio-in-iframe))))
  (testing "MB_ALLOW_DATA_STUDIO_IN_IFRAME turns it on"
    (mt/with-temp-env-var-value! [mb-allow-data-studio-in-iframe "true"]
      (is (true? (ws.settings/allow-data-studio-in-iframe)))))
  (testing "the frontend reads it from a signed-in user's session properties"
    (mt/with-temp-env-var-value! [mb-allow-data-studio-in-iframe "true"]
      (is (true? (:allow-data-studio-in-iframe (setting/user-readable-values-map #{:public :authenticated})))))))
