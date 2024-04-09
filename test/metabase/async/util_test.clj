(ns metabase.async.util-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.async.util :as async.u]
   [metabase.test.util.async :as tu.async]))

(set! *warn-on-reflection* true)

(deftest ^:parallel promise-chan?-test
  (doseq [[x expected] {(a/promise-chan) true
                        (a/chan 1)       false
                        (a/chan)         false
                        nil              false
                        "ABC"            false}]
    (is (= expected
           (async.u/promise-chan? x)))))

(deftest ^:parallel cancelable-thread-test
  (testing "Make sure `cancelable-thread` can actually run a function correctly"
    (tu.async/with-open-channels [result-chan (async.u/cancelable-thread
                                                (Thread/sleep 10)
                                                ::success)]
      (is (= ::success
             (first (a/alts!! [result-chan (a/timeout 500)]))))))

  (testing (str "when you close the result channel of `cancelable-thread`, it should cancel the future that's running "
                "it. This will produce an InterruptedException")
    (tu.async/with-open-channels [started-chan  (a/chan 1)
                                  finished-chan (a/chan 1)]
      (let [result-chan (async.u/cancelable-thread
                          (try
                            (a/>!! started-chan ::started)
                            (Thread/sleep 5000)
                            (a/>!! finished-chan ::finished)
                            (catch Throwable e
                              (a/>!! finished-chan e))))]
        ;; wait for `f` to actually start running before we kill it. Otherwise it may not get started at all
        (a/go
          (a/alts!! [started-chan (a/timeout 1000)])
          (a/close! result-chan))
        (is (instance?
             InterruptedException
             (first (a/alts!! [finished-chan (a/timeout 1000)]))))))))
