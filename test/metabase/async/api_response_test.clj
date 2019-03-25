(ns metabase.async.api-response-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.async.api-response :as async-response]
            [metabase.test.util.async :as tu.async]
            [ring.core.protocols :as ring.protocols])
  (:import [java.io ByteArrayOutputStream Closeable]))

(def ^:private long-timeout-ms
  ;; 5 seconds
  (* 5 1000))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   New Tests                                                    |
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
        (let [{output-chan :body, :as response} (#'async-response/async-keepalive-response input-chan)]
          (ring.protocols/write-body-to-stream output-chan response os)
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
  (some->
   os
   .toString
   (json/parse-string keyword)
   ((fn [response]
      (cond-> response
        (:stacktrace response) (update :stacktrace (partial every? string?)))))))


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
    (with-response [{:keys [output-chan]} input-chan]
      ;; send the result to the input channel
      (a/>!! input-chan {:success true})
      (wait-for-close output-chan)
      ;; now see if input-chan is closed
      (wait-for-close input-chan))))

;; when we send a message to the input channel, output-chan should *also* get closed
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [output-chan]} input-chan]
      ;; send the result to the input channel
      (a/>!! input-chan {:success true})
      ;; now see if output-chan is closed
      (wait-for-close output-chan))))

;; ...and the output-stream should be closed as well
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os-closed-chan]} input-chan]
      (a/>!! input-chan {:success true})
      (wait-for-close os-closed-chan))))


;;; ----------------------------------------- Input-chan closed unexpectedly -----------------------------------------

;; if we close input-channel prematurely, output-channel should get closed
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [output-chan]} input-chan]
      (a/close! input-chan)
      (wait-for-close output-chan))))

;; ...as should the output stream
(expect
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os-closed-chan]} input-chan]
      (a/close! input-chan)
      (wait-for-close os-closed-chan))))

;; An error should be written to the output stream
(expect
  {:message    "Input channel unexpectedly closed."
   :type       "class java.lang.InterruptedException"
   :stacktrace true}
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os os-closed-chan]} input-chan]
      (a/close! input-chan)
      (wait-for-close os-closed-chan)
      (os->response os))))


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


;;; ------------ Normal response with a delay: message sent to Input chan at unspecified point in future -------------

;; Should write newlines if it has to wait
(expect
  "\n\n{\"ready?\":true}"
  (with-redefs [async-response/keepalive-interval-ms 500]
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [os-closed-chan os]} input-chan]
        (a/<!! (a/timeout 1400))
        (a/>!! input-chan {:ready? true})
        (wait-for-close os-closed-chan)
        (.toString os)))))


;;; --------------------------------------- input chan message is an Exception ---------------------------------------

;; If the message sent to input-chan is an Exception an appropriate response should be generated
(expect
  {:message "Broken", :type "class java.lang.Exception", :stacktrace true}
  (tu.async/with-chans [input-chan]
    (with-response [{:keys [os os-closed-chan]} input-chan]
      (a/>!! input-chan (Exception. "Broken"))
      (wait-for-close os-closed-chan)
      (os->response os))))


;;; ------------------------------------------ input-chan never written to -------------------------------------------

;; If we write a bad API endpoint and return a channel but never write to it, the request should be canceled after
;; `absolute-max-keepalive-ms`
(expect
  {:message    "No response after waiting 500 ms. Canceling request."
   :type       "class java.util.concurrent.TimeoutException"
   :stacktrace true}
  (with-redefs [async-response/absolute-max-keepalive-ms 500]
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [os os-closed-chan]} input-chan]
        (wait-for-close os-closed-chan)
        (os->response os)))))

;; input chan should get closed
(expect
  (with-redefs [async-response/absolute-max-keepalive-ms 500]
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [os-closed-chan]} input-chan]
        (wait-for-close os-closed-chan)
        (wait-for-close input-chan)))))

;; output chan should get closed
(expect
  (with-redefs [async-response/absolute-max-keepalive-ms 500]
    (tu.async/with-chans [input-chan]
      (with-response [{:keys [output-chan os-closed-chan]} input-chan]
        (wait-for-close os-closed-chan)
        (wait-for-close output-chan)))))
