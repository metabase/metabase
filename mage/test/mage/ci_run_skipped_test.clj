(ns mage.ci-run-skipped-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.ci-run-skipped :as ci-run-skipped]))

(set! *warn-on-reflection* true)

(deftest next-step-test
  (let [pr-run {:databaseId 1, :verdict "force-skip"}]
    (testing "a PR run that was not skipped is the answer"
      (is (= {:step :not-skipped, :run {:databaseId 1, :verdict "defer"}}
             (ci-run-skipped/next-step {:databaseId 1, :verdict "defer"} [{:databaseId 2}]))))
    (testing "a PR run that was not skipped never looks up runs started by hand"
      (is (= :not-skipped
             (:step (ci-run-skipped/next-step {:databaseId 1, :verdict "defer"}
                                              (lazy-seq (throw (ex-info "looked up" {}))))))))
    (testing "a skipped PR run reuses a run already started for the commit"
      (is (= {:step :already-started, :run {:databaseId 3, :conclusion "success"}}
             (ci-run-skipped/next-step pr-run [{:databaseId 2, :conclusion "cancelled"}
                                               {:databaseId 3, :conclusion "success"}]))))
    (testing "a skipped PR run starts a run when every earlier one was cancelled"
      (is (= {:step :start}
             (ci-run-skipped/next-step pr-run [{:databaseId 2, :conclusion "cancelled"}]))))
    (testing "an in-progress run has no conclusion yet and is reused"
      (is (= :already-started
             (:step (ci-run-skipped/next-step pr-run [{:databaseId 4, :conclusion ""}])))))))

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

(deftest dispatch-args-test
  (testing "master is the workflow's default, so it is not passed"
    (is (= ["workflow" "run" "run-tests.yml" "-R" "metabase/metabase" "--ref" "my-branch"]
           (ci-run-skipped/dispatch-args "my-branch" "master"))))
  (testing "any other base is passed as the `base` input"
    (is (= ["workflow" "run" "run-tests.yml" "-R" "metabase/metabase" "--ref" "my-branch"
            "-f" "base=release-x.60.x"]
           (ci-run-skipped/dispatch-args "my-branch" "release-x.60.x")))))

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
