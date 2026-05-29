(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;; All tests in this ns exercise set/clear-instance-workspace!, which are gated on :workspaces
;; (see GHY-3685). Enable the feature for every test in this ns.
(use-fixtures :each (fn [thunk]
                      (mt/with-premium-features #{:workspaces}
                        (try
                          (thunk)
                          (finally
                            (ws/clear-instance-workspace!))))))

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
