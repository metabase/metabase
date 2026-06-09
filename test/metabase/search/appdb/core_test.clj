(ns metabase.search.appdb.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.search.appdb.core :as appdb.core]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; The cluster-wide reindex lock funnels every index-build trigger through one choke point. These tests
;;; pin the try-acquire-skip contract of the helper without needing real cross-node concurrency, by
;;; standing in for the underlying cluster-lock acquisition.

(deftest reindex-lock-runs-body-when-free-test
  (testing "when the lock is free, the body runs and its value is returned"
    (mt/with-dynamic-fn-redefs [cluster-lock/do-with-cluster-lock (fn [_opts thunk] (thunk))]
      (is (= :ran (#'appdb.core/do-with-reindex-lock (constantly :ran)))))))

(deftest reindex-lock-skips-when-held-test
  (testing "when another node/thread holds the lock, the body is skipped and nil is returned"
    (let [ran (atom false)]
      ;; do-with-cluster-lock wraps a failed acquisition in an ex-info carrying :lock-names
      (mt/with-dynamic-fn-redefs [cluster-lock/do-with-cluster-lock
                                  (fn [_opts _thunk]
                                    (throw (ex-info "Failed to obtain cluster lock: search-index"
                                                    {:lock-names ["search-index"] :retries 0})))]
        (is (nil? (#'appdb.core/do-with-reindex-lock (fn [] (reset! ran true) :ran))))
        (is (false? @ran) "the reindex body must not run while a build is already in progress")))))

(deftest reindex-lock-propagates-real-errors-test
  (testing "an error from the body itself is not mistaken for a held lock — it propagates"
    (mt/with-dynamic-fn-redefs [cluster-lock/do-with-cluster-lock (fn [_opts thunk] (thunk))]
      (is (thrown-with-msg? Exception #"boom"
                            (#'appdb.core/do-with-reindex-lock (fn [] (throw (ex-info "boom" {}))))))))
  (testing "an unrelated cluster-lock ExceptionInfo (no :lock-names) also propagates"
    (mt/with-dynamic-fn-redefs [cluster-lock/do-with-cluster-lock
                                (fn [_opts _thunk] (throw (ex-info "unexpected" {:something :else})))]
      (is (thrown-with-msg? Exception #"unexpected"
                            (#'appdb.core/do-with-reindex-lock (constantly :ran)))))))
