(ns mage.bot.dev-env-core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.bot.dev-env-core :as core]))

(set! *warn-on-reflection* true)

(deftest worktree-name-test
  (is (= "my-worktree" (core/worktree-name "/home/user/src/my-worktree")))
  (is (= "metabase" (core/worktree-name "/Users/nvoxland/src/metabase"))))

(deftest db-name-test
  (is (= "my_worktree" (core/db-name "/path/to/my-worktree")))
  (is (= "my_wt_2" (core/db-name "/path/to/my-wt.2")))
  (is (= "simple" (core/db-name "/path/to/simple"))))

(deftest compute-slot-test
  (testing "deterministic — same input always gives same output"
    (is (= (core/compute-slot "/path/to/wt" nil)
           (core/compute-slot "/path/to/wt" nil))))
  (testing "range 0-99"
    (let [slot (core/compute-slot "/path/to/wt" nil)]
      (is (<= 0 slot 99))))
  (testing "override bypasses hash"
    (is (= 42 (core/compute-slot "/path/to/wt" 42)))))

(deftest port-for-test
  (is (= 3005 (core/port-for :jetty 5)))
  (is (= 8080 (core/port-for :frontend-dev 0)))
  (is (= 50615 (core/port-for :nrepl 10))))

(deftest container-prefix-test
  (is (= "mb-my-wt-" (core/container-prefix "/path/to/my-wt"))))

(deftest build-docker-cmd-test
  (let [cmd (core/build-docker-cmd "test-container" "postgres:17"
                                   [[5432 5432]] {"POSTGRES_USER" "metabase"})]
    (is (= "docker" (first cmd)))
    (is (some #{"run"} cmd))
    (is (some #{"-d"} cmd))
    (is (some #{"-p"} cmd))
    (is (some #{"5432:5432"} cmd))
    (is (some #{"-e"} cmd))
    (is (some #{"POSTGRES_USER=metabase"} cmd))
    (is (some #{"--name"} cmd))
    (is (some #{"test-container"} cmd))
    (is (= "postgres:17" (last cmd)))))
