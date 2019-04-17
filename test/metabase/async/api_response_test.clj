(ns metabase.async.api-response-test
  (:require [cheshire.core :as json]
            [clj-http.client :as client]
            [clojure.core.async :as a]
            [compojure.core :as compojure]
            [expectations :refer [expect]]
            [metabase
             [server :as server]
             [util :as u]]
            [metabase.async.api-response :as async-response]
            [metabase.test.util.async :as tu.async]
            [ring.core.protocols :as ring.protocols])
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
                           :content-type "applicaton/json; charset=utf-8"}]
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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            Tests to make sure keepalive bytes actually get written                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-temp-server [handler f]
  (let [port   (+ 60000 (rand-int 5000))
        server (server/create-server handler {:port port})]
    (try
      (.start server)
      (f port)
      (finally
        (.stop server)))))

(defmacro ^:private with-temp-server
  "Spin up a Jetty server with `handler` with a random port between 60000 and 65000; bind the random port to `port`, and
  execute body. Shuts down server when finished."
  [[port-binding handler] & body]
  `(do-with-temp-server ~handler (fn [~port-binding] ~@body)))

(defn- num-keepalive-chars-in-response
  "Make a request to `handler` and count the number of newline keepalive chars in the response."
  [handler]
  (with-redefs [async-response/keepalive-interval-ms 50]
    (with-temp-server [port handler]
      (let [{response :body} (client/get (format "http://localhost:%d/" port))]
        (count (re-seq #"\n" response))))))

(defn- output-chan-with-delayed-result
  "Returns an output channel that receives a 'DONE' value after 400ms. "
  []
  (u/prog1 (a/chan 1)
    (a/go
      (a/<! (a/timeout 400))
      (a/>! <> "DONE"))))

;; confirm that some newlines were written as part of the response for an async API response
(defn- async-handler [_ respond _]
  (respond {:status 200, :headers {"Content-Type" "text/plain"}, :body (output-chan-with-delayed-result)}))

(expect pos? (num-keepalive-chars-in-response async-handler))

;; make sure newlines are written for sync-style compojure endpoints (e.g. `defendpoint`)
(def ^:private compojure-sync-handler
  (compojure/routes
   (compojure/GET "/" [_] (output-chan-with-delayed-result))))

(expect pos? (num-keepalive-chars-in-response compojure-sync-handler))

;; ...and for true async compojure endpoints (e.g. `defendpoint-async`)
(def ^:private compojure-async-handler
  (compojure/routes
   (compojure/GET "/" [] (fn [_ respond _] (respond (output-chan-with-delayed-result))))))

(expect pos? (num-keepalive-chars-in-response compojure-async-handler))
