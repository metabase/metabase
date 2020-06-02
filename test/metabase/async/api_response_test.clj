(ns metabase.async.api-response-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.async.api-response :as async-response]
            [metabase.test.util.async :as tu.async]
            [ring.core.protocols :as ring.protocols]
            [schema.core :as s])
  (:import [java.io ByteArrayOutputStream Closeable]))

(def ^:private long-timeout-ms
  ;; 5 seconds
  (* 5 1000))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Tests to make sure channels do the right thing                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-response [input-chan f]
  ;; don't wait more than 10 seconds for results, our tests or code are busted otherwise
  (with-redefs [async-response/absolute-max-keepalive-ms (min (* 10 1000) @#'async-response/absolute-max-keepalive-ms)]
    (tu.async/with-chans [os-closed-chan]
      (with-open [os (proxy [ByteArrayOutputStream] []
                       (close []
                         (a/close! os-closed-chan)
                         (let [^Closeable this this]
                           (proxy-super close))))]
        ;; normally `write-body-to-stream` will create the `output-chan`, however we want to do it ourselves so we can
        ;; truly enjoy the magical output channel slash see when it gets closed. Create it now...
        (let [output-chan (#'async-response/async-keepalive-channel input-chan)
              response    {:status       200
                           :headers      {}
                           :body         input-chan
                           :content-type "application/json; charset=utf-8"}]
          ;; and keep it from getting [re]created.
          (with-redefs [async-response/async-keepalive-channel identity]
            (ring.protocols/write-body-to-stream output-chan response os))
          (try
            (f {:os os, :output-chan output-chan, :os-closed-chan os-closed-chan})
            (finally
              (a/close! output-chan))))))))

(defmacro ^:private with-response [[response-objects-binding input-chan] & body]
  `(do-with-response ~input-chan (fn [~response-objects-binding] ~@body)))

(defn- wait-for-close [chan]
  (tu.async/wait-for-close chan long-timeout-ms)
  true)

(defn- os->response [^ByteArrayOutputStream os]
  (some-> os .toString (json/parse-string keyword)))


;;; ------------------------------ Normal responses: message sent to the input channel -------------------------------

;; check that response is actually written to the output stream
(expect
  {:success true}
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os os-closed-chan]} input-chan]
      (a/>!! input-chan {:success true})
      (wait-for-close os-closed-chan)
      (os->response os))))

;; when we send a single message to the input channel, it should get closed automatically by the async code
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os-closed-chan]} input-chan]
      ;; send the result to the input channel
      (a/>!! input-chan {:success true})
      (wait-for-close os-closed-chan)
      ;; now see if input-chan is closed
      (wait-for-close input-chan))))

;; when we send a message to the input channel, output-chan should *also* get closed
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os-closed-chan output-chan]} input-chan]
      ;; send the result to the input channel
      (a/>!! input-chan {:success true})
      (wait-for-close os-closed-chan)
      ;; now see if output-chan is closed
      (wait-for-close output-chan))))

;; ...and the output-stream should be closed as well
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os-closed-chan]} input-chan]
      (a/>!! input-chan {:success true})
      (wait-for-close os-closed-chan))))


;;; ----------------------------------------- Input-chan closed unexpectedly -----------------------------------------

(deftest input-chan-closed-unexpectedly-test
  (testing "When input-channel is closed prematurely"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [os output-chan os-closed-chan]} input-chan]
        (a/close! input-chan)
        (testing "output-channel should get closed"
          ;; output-chan may or may not get the InterruptedException written to it -- it's a race condition -- we're just
          ;; want to make sure it closes
          (not= ::tu.async/timed-out (tu.async/wait-for-result output-chan))

          (testing "...as should the output stream"
            (is (= true
                   (wait-for-close os-closed-chan)))))

        (testing "An error should be written to the output stream"
          (is (schema= {:message (s/eq "Input channel unexpectedly closed.")
                        :type    (s/eq "class java.lang.InterruptedException")
                        :_status (s/eq 500)
                        :trace   s/Any
                        s/Any    s/Any}
                       (os->response os))))))))


;;; ------------------------------ Output-chan closed early (i.e. API request canceled) ------------------------------

;; If output-channel gets closed (presumably because the API request is canceled), input-chan should also get closed
(expect
 (tu.async/with-chans [input-chan]
   (with-response [{:keys [output-chan]} input-chan]
     (a/close! output-chan)
     (wait-for-close input-chan))))

;; if output chan gets closed, output-stream should also get closed
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [output-chan os-closed-chan]} input-chan]
      (a/close! output-chan)
      (wait-for-close os-closed-chan))))

;; we shouldn't bother writing anything to the output stream if output-chan is closed because it should already be
;; closed
(expect
  nil
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [output-chan os os-closed-chan]} input-chan]
      (a/close! output-chan)
      (wait-for-close os-closed-chan)
      (os->response os))))


;;; --------------------------------------- input chan message is an Exception ---------------------------------------

(deftest input-change-message-is-exception-test
  (testing "If the message sent to input-chan is an Exception an appropriate response should be generated"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [os os-closed-chan]} input-chan]
        (a/>!! input-chan (Exception. "Broken"))
        (wait-for-close os-closed-chan)
        (is (schema= {:message  (s/eq "Broken")
                      :type     (s/eq "class java.lang.Exception")
                      :trace    s/Any
                      :_status  (s/eq 500)
                      s/Keyword s/Any}
                     (os->response os)))))))


;;; ------------------------------------------ input-chan never written to -------------------------------------------

(deftest input-chan-never-written-to-test
  (testing (str "If we write a bad API endpoint and return a channel but never write to it, the request should be "
                "canceled after `absolute-max-keepalive-ms`")
    (with-redefs [async-response/absolute-max-keepalive-ms 50]
      (tu.async/with-chans [input-chan]
        (with-response [{:keys [os os-closed-chan output-chan]} input-chan]
          (is (= true
                 (wait-for-close os-closed-chan)))
          (testing "error should be written to output stream"
            (is (schema= {:message  (s/eq "No response after waiting 50.0 ms. Canceling request.")
                          :type     (s/eq "class java.util.concurrent.TimeoutException")
                          :_status  (s/eq 500)
                          :trace    s/Any
                          s/Keyword s/Any}
                         (os->response os))))

          (testing "input chan should get closed"
            (is (= true
                   (wait-for-close input-chan))))

          (testing "output chan should get closed"
            (is (= true
                   (wait-for-close output-chan)))))))))
