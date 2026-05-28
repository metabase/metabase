(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.settings :as ws.settings]
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

(deftest development-instance?-defaults-to-false-test
  (testing "development-instance? defaults to false without a workspace and without the setting"
    (mt/with-premium-features #{:workspaces}
      (ws/clear-instance-workspace!)
      (mt/with-temporary-setting-values [ws.settings/development-instance? false]
        (is (false? (ws.settings/development-instance?)))))))

(deftest development-instance?-honors-explicit-setting-test
  (testing "development-instance? returns true when the setting is explicitly enabled"
    (mt/with-premium-features #{:workspaces}
      (ws/clear-instance-workspace!)
      (mt/with-temporary-setting-values [ws.settings/development-instance? true]
        (is (true? (ws.settings/development-instance?)))))))

(deftest development-instance?-implicitly-true-when-workspace-loaded-test
  (testing "development-instance? is implicitly true when an instance-workspace is loaded, even when the setting is false"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [ws.settings/development-instance? false]
        (ws/set-instance-workspace! {:name "Acme" :databases {}})
        (is (true? (ws.settings/development-instance?)))
        (ws/clear-instance-workspace!)
        (is (false? (ws.settings/development-instance?)))))))
