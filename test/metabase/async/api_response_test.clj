(ns metabase.async.api-response-test
  (:require
   [cheshire.core :as json]
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [clojure.tools.logging :as log]
   [metabase.async.api-response :as async-response]
   [metabase.test.util.async :as tu.async]
   [ring.core.protocols :as ring.protocols]
   [schema.core :as s])
  (:import
   (java.io ByteArrayOutputStream Closeable OutputStream)))

(set! *warn-on-reflection* true)

(def ^:private long-timeout-ms
  ;; 5 seconds
  (* 5 1000))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                 Tests to make sure channels do the right thing                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- error-when-writing-if-already-closed-ByteArrayOutputStream
  "Normally closing a ByteArrayOutputStream has no effect. This wraps one so it will cause an IO error if you attempt to
  write to it after it is closed. This simulates the EoF error that happens when the Jetty OutputStreams get
  closed (when the HTTP connection itself is closed)."
  ^ByteArrayOutputStream [^ByteArrayOutputStream os]
  (let [closed? (atom false)]
    (proxy [ByteArrayOutputStream] []
      (close []
        (reset! closed? true)
        (.close os))
      (write
        ([byyte]
         (when @closed?
           (throw (java.io.IOException. "OutputStream already closed!")))
         (.write os ^int byyte))
        ([byytes offset length]
         (when @closed?
           (throw (java.io.IOException. "OutputStream already closed!")))
         (.write os ^bytes byytes offset length)))
      (writeBytes [byytes]
        (when @closed?
          (throw (java.io.IOException. "OutputStream already closed!")))
        (.writeBytes os byytes))
      (toByteArray []
        (.toByteArray os))
      (toString []
        (.toString os)))))

(defn- do-with-response [input-chan f]
  ;; don't wait more than 10 seconds for results, our tests or code are busted otherwise
  (binding [async-response/*absolute-max-keepalive-ms* (min (* 10 1000) @#'async-response/*absolute-max-keepalive-ms*)]
    (tu.async/with-chans [os-closed-chan]
      (with-open [os (error-when-writing-if-already-closed-ByteArrayOutputStream
                      (proxy [ByteArrayOutputStream] []
                        (close []
                          (log/debug "ByteArrayOutputStream was closed.")
                          (a/close! os-closed-chan)
                          (let [^Closeable this this]
                            (proxy-super close)))))]
        (let [response {:status       200
                        :headers      {}
                        :body         input-chan
                        :content-type "application/json; charset=utf-8"}]
          (ring.protocols/write-body-to-stream input-chan response os)
          (try
            (f {:os os, :os-closed-chan os-closed-chan})
            (finally
              (a/close! input-chan))))))))

(defmacro ^:private with-response [[response-objects-binding input-chan] & body]
  `(do-with-response ~input-chan (fn [~response-objects-binding] ~@body)))

(defn- wait-for-close [chan]
  (tu.async/wait-for-close chan long-timeout-ms)
  true)

(defn- os->response [^ByteArrayOutputStream os]
  (some-> os .toString (json/parse-string keyword)))


;;; ------------------------------ Normal responses: message sent to the input channel -------------------------------

(deftest ^:parallel write-response-to-output-stream-test
  (testing "check that response is actually written to the output stream"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [^OutputStream os os-closed-chan]} input-chan]
        (a/>!! input-chan {:success true})
        (wait-for-close os-closed-chan)
        (is (= {:success true}
               (os->response os)))))))

(deftest ^:parallel close-input-channel-test
  (testing "when we send a single message to the input channel, it should get closed automatically by the async code"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [^OutputStream os-closed-chan]} input-chan]
        ;; send the result to the input channel
        (a/>!! input-chan {:success true})
        (is (= true
               (wait-for-close os-closed-chan)))
        ;; now see if input-chan is closed
        (is (= true
               (wait-for-close input-chan)))))))

(deftest ^:parallel close-output-stream-test
  (testing "...and the output-stream should be closed as well"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [^OutputStream os-closed-chan]} input-chan]
        (a/>!! input-chan {:success true})
        (is (= true
               (wait-for-close os-closed-chan)))))))


;;; ----------------------------------------- Input-chan closed unexpectedly -----------------------------------------

(deftest ^:parallel input-chan-closed-unexpectedly-test
  (testing "When input-channel is closed prematurely"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [^OutputStream os os-closed-chan]} input-chan]
        (a/close! input-chan)
        (testing "output stream should have gotten closed"
          (is (= true
                 (wait-for-close os-closed-chan))))
        (testing "An error should be written to the output stream"
          (is (schema= {:message (s/eq "Input channel unexpectedly closed.")
                        :_status (s/eq 500)
                        :trace   s/Any
                        s/Any    s/Any}
                       (os->response os))))))))


;;; ----------------------------- Output stream closed early (i.e. API request canceled) -----------------------------

(deftest ^:parallel write-keepalive-character-return-false-for-closed-output-stream-test
  (testing "output stream closed"
    (with-open [os (error-when-writing-if-already-closed-ByteArrayOutputStream (ByteArrayOutputStream.))]
      (.close os)
      (is (= false
             (#'async-response/write-keepalive-character! os))))))

(deftest ^:parallel close-input-chan-when-os-gets-closed-test
  (testing (str "If output stream gets closed (presumably because the API request is canceled), input-chan should "
                "also get closed")
    (tu.async/with-chans [input-chan]
      ;; write a keepalive byte every 50ms. The first attempt to write a byte after the output stream is closed should
      ;; cause the input channel to get closed.
      (binding [async-response/*keepalive-interval-ms* 50]
        (with-response [{:keys [^OutputStream os]} input-chan]
          (.close os)
          (is (= true
                 (wait-for-close input-chan))))))))


;;; --------------------------------------- input chan message is an Exception ---------------------------------------

(deftest ^:parallel input-chan-message-is-exception-test
  (testing "If the message sent to input-chan is an Exception an appropriate response should be generated"
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [^OutputStream os os-closed-chan]} input-chan]
        (a/>!! input-chan (Exception. "Broken"))
        (wait-for-close os-closed-chan)
        (is (schema= {:message  (s/eq "Broken")
                      :trace    s/Any
                      :_status  (s/eq 500)
                      s/Keyword s/Any}
                     (os->response os)))))))


;;; ------------------------------------------ input-chan never written to -------------------------------------------

(deftest ^:parallel input-chan-never-written-to-test
  (testing (str "If we write a bad API endpoint and return a channel but never write to it, the request should be "
                "canceled after `*absolute-max-keepalive-ms*`")
    (binding [async-response/*keepalive-interval-ms*     40
              async-response/*absolute-max-keepalive-ms* 50]
      (tu.async/with-chans [input-chan]
        (with-response [{:keys [os-closed-chan ^OutputStream os]} input-chan]
          (testing "OutputStream should have been closed"
            (is (= true
                   (wait-for-close os-closed-chan))))
          (testing "error should be written to output stream"
            (is (schema= {:message  (s/eq "No response after waiting 50.0 ms. Canceling request.")
                          :_status  (s/eq 500)
                          :trace    s/Any
                          s/Keyword s/Any}
                         (os->response os))))
          (testing "input chan should get closed"
            (is (= true
                   (wait-for-close input-chan)))))))))
