(ns metabase.async.util-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.async.util :as async.u]
            [metabase.test.util.async :as tu.async]))

(deftest promise-chan?-test
  (doseq [[x expected] {(a/promise-chan) true
                        (a/chan 1)       false
                        (a/chan)         false
                        nil              false
                        "ABC"            false}]
    (is (= expected
           (async.u/promise-chan? x)))))

(deftest promise-pipe-test
  (testing "make sure `single-value-pipe` pipes a value from in-chan to out-chan"
    (tu.async/with-open-channels [in-chan  (a/promise-chan)
                                  out-chan (a/promise-chan)]
      (async.u/promise-pipe in-chan out-chan)
      (a/>!! in-chan ::value)
      (is (= ::value
             (first (a/alts!! [out-chan (a/timeout 1000)]))))))

  (testing "`promise-pipe` should close input-chan if output-chan is closed"
    (tu.async/with-open-channels [in-chan  (a/promise-chan)
                                  out-chan (a/promise-chan)]
      (async.u/promise-pipe in-chan out-chan)
      (a/close! out-chan)
      (is (= true
             (boolean (tu.async/wait-for-close in-chan 100))))))

  (testing "`promise-pipe` should close output-chan if input-chan is closed"
    (tu.async/with-open-channels [in-chan  (a/promise-chan)
                                  out-chan (a/promise-chan)]
      (async.u/promise-pipe in-chan out-chan)
      (a/close! in-chan)
      (is (= true
             (tu.async/wait-for-close out-chan 100)))))

  (testing "if you are a knucklehead and write directly to out-chan it should close `in-chan`"
    (tu.async/with-open-channels [in-chan  (a/promise-chan)
                                  out-chan (a/promise-chan)]
      (async.u/promise-pipe in-chan out-chan)
      (a/>!! out-chan "Oops")
      (let [timeout-chan (a/timeout 1000)
            [val port]   (a/alts!! [in-chan timeout-chan])]
        (is (= nil
               val))
        (is (= :in-chan
               (condp = port
                 in-chan      :in-chan
                 out-chan     :out-chan
                 timeout-chan :timeout-chan
                 port))))))

  (testing "can we combine multiple single value pipes?"
    (tu.async/with-open-channels [in-chan    (a/promise-chan)
                                  out-chan-1 (a/promise-chan)
                                  out-chan-2 (a/promise-chan)]
      (async.u/promise-pipe in-chan out-chan-1)
      (async.u/promise-pipe out-chan-1 out-chan-2)
      (a/>!! in-chan ::value)
      (is (= ::value
             (first (a/alts!! [out-chan-2 (a/timeout 1000)])))))))

(deftest cancelable-thread-test
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
             (first (a/alts!! [finished-chan (a/timeout 1000)])))))))

  (testing "We should be able to combine the `promise-pipe` and `cancelable-thread` and get results"
    (letfn [(f []
              (Thread/sleep 10)
              ::success)]
      (tu.async/with-open-channels [result-chan (a/promise-chan)]
        (async.u/promise-pipe (async.u/cancelable-thread-call f) result-chan)
        (is (= ::success
               (first (a/alts!! [result-chan (a/timeout 500)]))))))))
