(ns mage.bot.dev-env-core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.bot.dev-env :as dev-env]))

(set! *warn-on-reflection* true)

(deftest worktree-name-test
  (is (= "my-worktree" (dev-env/worktree-name "/home/user/src/my-worktree")))
  (is (= "metabase" (dev-env/worktree-name "/Users/nvoxland/src/metabase"))))

(deftest db-name-test
  (is (= "my_worktree" (dev-env/db-name "/path/to/my-worktree")))
  (is (= "my_wt_2" (dev-env/db-name "/path/to/my-wt.2")))
  (is (= "simple" (dev-env/db-name "/path/to/simple"))))

(deftest compute-slot-test
  (testing "deterministic — same input always gives same output"
    (is (= (dev-env/compute-slot "/path/to/wt" nil)
           (dev-env/compute-slot "/path/to/wt" nil))))
  (testing "range 0-99"
    (let [slot (dev-env/compute-slot "/path/to/wt" nil)]
      (is (<= 0 slot 99))))
  (testing "override bypasses hash"
    (is (= 42 (dev-env/compute-slot "/path/to/wt" 42)))))

(deftest port-for-test
  (is (= 3005 (dev-env/port-for :jetty 5)))
  (is (= 8080 (dev-env/port-for :frontend-dev 0)))
  (is (= 50615 (dev-env/port-for :nrepl 10))))

(deftest container-prefix-test
  (is (= "mb-my-wt-" (dev-env/container-prefix "/path/to/my-wt"))))
