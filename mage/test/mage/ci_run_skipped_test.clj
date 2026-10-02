(ns mage.ci-run-skipped-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.ci-run-skipped :as ci-run-skipped]))

(set! *warn-on-reflection* true)

(deftest next-step-test
  (let [pr-run    {:databaseId 1, :verdict "force-skip"}
        cancelled {:databaseId 2, :status "completed", :conclusion "cancelled"}
        failed    {:databaseId 3, :status "completed", :conclusion "failure"}
        running   {:databaseId 4, :status "in_progress", :conclusion ""}
        broken    {:databaseId 5, :status "completed", :conclusion "startup_failure"}
        timed-out {:databaseId 6, :status "completed", :conclusion "timed_out"}]
    (testing "a PR run that was not skipped is the answer"
      (is (= {:step :not-skipped, :run {:databaseId 1, :verdict "defer"}}
             (ci-run-skipped/next-step {:databaseId 1, :verdict "defer"} [failed]))))
    (testing "a PR run that was not skipped never looks up runs started by hand"
      (is (= :not-skipped
             (:step (ci-run-skipped/next-step {:databaseId 1, :verdict "defer"}
                                              (lazy-seq (throw (ex-info "looked up" {}))))))))
    (testing "a skipped PR run reuses a run that finished its tests"
      (is (= {:step :already-started, :run failed}
             (ci-run-skipped/next-step pr-run [cancelled failed]))))
    (testing "a skipped PR run reuses a run that is still going"
      (is (= {:step :already-started, :run running}
             (ci-run-skipped/next-step pr-run [running]))))
    (testing "a skipped PR run starts a run when no earlier one finished its tests"
      (is (= {:step :start}
             (ci-run-skipped/next-step pr-run [cancelled broken timed-out]))))))

(deftest parse-verdict-test
  (testing "reads the printed verdict, not the echo command above it"
    (is (= "force-skip"
           (ci-run-skipped/parse-verdict
            (str "2026-10-02T12:25:52.1Z [36;1mecho \"verdict=$VERDICT\" | tee -a \"$GITHUB_OUTPUT\"[0m\n"
                 "2026-10-02T12:25:52.2Z verdict=force-skip\n")))))
  (testing "nil without a verdict line"
    (is (nil? (ci-run-skipped/parse-verdict "2026-10-02T12:25:52.1Z Decide\n")))
    (is (nil? (ci-run-skipped/parse-verdict nil)))))

(deftest stack-base-test
  (testing "a stacked PR compares against the branch its stack targets"
    (is (= "release-x.60.x"
           (ci-run-skipped/stack-base {:baseRefName "parent-branch"
                                       :stack       {:baseRefName "release-x.60.x"}}))))
  (testing "an unstacked PR compares against its own base"
    (is (= "master"
           (ci-run-skipped/stack-base {:baseRefName "master"
                                       :stack       nil})))))

(deftest run-labels-test
  (testing "keeps the ci:run-* labels except ci:run-all, sorted"
    (is (= "ci:run-all-drivers,ci:run-snowflake"
           (ci-run-skipped/run-labels {:labels {:nodes [{:name "ci:run-snowflake"}
                                                        {:name "ci:run-all"}
                                                        {:name "backport"}
                                                        {:name "ci:run-all-drivers"}]}}))))
  (testing "empty without any"
    (is (= "" (ci-run-skipped/run-labels {:labels {:nodes [{:name "backport"}]}})))))

(deftest dispatch-args-test
  (let [args ["workflow" "run" "run-tests.yml" "-R" "metabase/metabase" "--ref" "my-branch"]]
    (testing "always passes the base, master included"
      (is (= (conj args "-f" "base=master")
             (ci-run-skipped/dispatch-args "my-branch" "master" ""))))
    (testing "passes labels when there are any"
      (is (= (conj args "-f" "base=release-x.60.x" "-f" "labels=ci:run-snowflake")
             (ci-run-skipped/dispatch-args "my-branch" "release-x.60.x" "ci:run-snowflake"))))))

(deftest poll-test
  (testing "returns the first non-nil result"
    (let [results (atom [nil nil :done :unused])
          next!   (fn [] (let [result (first @results)] (swap! results rest) result))]
      (is (= :done (ci-run-skipped/poll "x" [0 0 0] next!)))
      (is (= [:unused] @results))))
  (testing "gives up with nil after the last pause"
    (let [calls (atom 0)]
      (is (nil? (ci-run-skipped/poll "x" [0 0] #(do (swap! calls inc) nil))))
      (is (= 3 @calls)))))

(deftest own-pr-test
  (testing "skips a fork's PR from a branch with the same name"
    (is (= {:number 2, :headRepository {:nameWithOwner "metabase/metabase"}}
           (ci-run-skipped/own-pr [{:number 1, :headRepository {:nameWithOwner "someone/metabase"}}
                                   {:number 2, :headRepository {:nameWithOwner "metabase/metabase"}}]))))
  (testing "nil when every PR is from a fork"
    (is (nil? (ci-run-skipped/own-pr [{:number 1, :headRepository {:nameWithOwner "someone/metabase"}}])))))
