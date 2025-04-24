(ns metabase.server.statistics-handler-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest testing is]]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.server.statistics-handler :as sut]
   [metabase.test :as mt])
  (:import
   (jakarta.servlet AsyncListener)
   (jakarta.servlet.http HttpServletRequest HttpServletResponse)
   (org.eclipse.jetty.ee9.nested HandlerWrapper Request)
   (org.eclipse.jetty.ee9.servlet ServletHandler ServletContextHandler)
   (org.eclipse.jetty.server LocalConnector Server)))

(set! *warn-on-reflection* true)

(defn on-complete-listener
  [done-channel]
  (proxy [AsyncListener] []
    (onComplete [_]
      (a/>!! done-channel :done))))

(defn- async-servlet-handler
  ^ServletHandler [status-code chan-start-handle chan-finish-handle]
  (proxy [ServletHandler] []
    (doHandle [_ ^Request request _ ^HttpServletResponse response]
      (let [async-context (.startAsync request)]
        (.setHandled request true)
        (a/<!! chan-start-handle)
        (a/go
          (.setStatus response status-code)
          (.setContentLength response 0)
          (.. response getOutputStream close)
          (a/<!! chan-finish-handle)
          (.complete async-context))
        (a/<!! chan-finish-handle)))))

(defn- servlet-handler
  ^ServletHandler [status-code chan-start-handle chan-finish-handle]
  (proxy [ServletHandler] []
    (doHandle [_ ^Request request _ ^HttpServletResponse response]
      (.setHandled request true)
      (a/<!! chan-start-handle)
      (.setStatus response status-code)
      (.setContentLength response 0)
      (.. response getOutputStream close)
      (a/<!! chan-finish-handle))))

(defn- waiting-wrapper
  "Sits above the statistics handler so we can wait for the handler to finish in tests"
  ^HandlerWrapper [chan-done-request]
  (proxy [HandlerWrapper] []
    (handle [^String path ^Request base-request ^HttpServletRequest request ^HttpServletResponse response]
      (try
        (.handle (.getHandler ^HandlerWrapper this) path base-request request response)
        (finally
          (let [state (.getHttpChannelState base-request)]
            (when (and (.isInitial state) (.isAsyncStarted state))
              (.addListener state (on-complete-listener chan-done-request))))
          (a/>!! chan-done-request :done))))))

(defn- do-with-server
  ^LocalConnector [status-code async? thunk]
  (let [chan-start-handle       (a/chan)
        chan-finish-handle      (a/chan)
        chan-done-request       (a/chan)
        handler                 (if async?
                                  (async-servlet-handler status-code chan-start-handle chan-finish-handle)
                                  (servlet-handler status-code chan-start-handle chan-finish-handle))
        servlet-context-handler (doto (ServletContextHandler.)
                                  (.setAllowNullPathInfo true)
                                  (.insertHandler (doto (waiting-wrapper chan-done-request)
                                                    (.setHandler (sut/new-handler))))
                                  (.setServletHandler handler))
        server                   (doto (Server.)
                                   (.setHandler servlet-context-handler))
        connector                (LocalConnector. server)]
    (.start server)
    (.start connector)
    (thunk connector chan-start-handle chan-finish-handle chan-done-request)
    (.stop connector)
    (.stop server)
    (.join server)))

(defmacro with-server
  [status-code async arguments & body]
  `(do-with-server ~status-code ~async (fn ~arguments ~@body)))

(deftest test-synchronous-metrics
  (testing "records stats for synchronous requests"
    (mt/with-prometheus-system! [_ system]
      (testing "when server responds 200"
        (with-server 200 false
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "2xx"})))))
      (testing "when server responds 400"
        (with-server 400 false
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting)))
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "4xx"})))))
      (testing "when server responds 300"
        (with-server 300 false
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "3xx"})))))
      (testing "when server responds 500"
        (with-server 500 false
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "5xx"}))))))))

(deftest test-asynchronous-metrics
  (testing "records stats for asynchronous requests"
    (mt/with-prometheus-system! [_ system]
      (testing "when server responds 200"
        (with-server 200 true
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (a/>!! chan-finish-handle :done) ;; finish the synchronous handler
          (a/<!! chan-done-request) ;; finished the synchronous wrapper
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting)))
          (a/>!! chan-finish-handle :done) ;; finish the async thread
          (a/<!! chan-done-request) ;; finished the async listener
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "2xx"})))))
      (testing "when server responds 400"
        (with-server 400 true
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting)))
          (a/>!! chan-finish-handle :done) ;; finish the async thread
          (a/<!! chan-done-request)
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/async-requests-waiting-max)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/async-requests-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/async-requests-waiting)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/requests-active)))
          (is (prometheus-test/approx= 2 (mt/metric-value system :jetty/dispatched-total)))
          (is (prometheus-test/approx= 0 (mt/metric-value system :jetty/dispatched-active)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/dispatched-active-max)))
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "4xx"})))))
      (testing "when server responds 300"
        (with-server 300 true
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (a/>!! chan-finish-handle :done) ;; finish the async thread
          (a/<!! chan-done-request)        ;; finished the outer async listener
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "3xx"})))))
      (testing "when server responds 500"
        (with-server 500 true
          [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
          (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
          (a/>!! chan-start-handle :done)
          (a/>!! chan-finish-handle :done)
          (a/<!! chan-done-request)
          (a/>!! chan-finish-handle :done) ;; finish the async thread
          (a/<!! chan-done-request)        ;; finished the outer async listener
          (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/responses-total {:code "5xx"}))))))))

(deftest test-request-duration-metrics
  (mt/with-prometheus-system! [_ system]
    (testing "when sync server responds 200"
      (with-server 200 false
        [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
        (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
        (a/>!! chan-start-handle :done)
        (Thread/sleep 1000)
        (a/>!! chan-finish-handle :done) ;; finish the synchronous handler
        (a/<!! chan-done-request)        ;; finished the synchronous wrapper
        (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/request-time-max-seconds) 0.5)))))
  (mt/with-prometheus-system! [_ system]
    (testing "when sync server responds 200"
      (with-server 200 true
        [^LocalConnector connector chan-start-handle chan-finish-handle chan-done-request]
        (.executeRequest connector "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
        (a/>!! chan-start-handle :done)
        (Thread/sleep 1000)
        (a/>!! chan-finish-handle :done) ;; finish the synchronous handler
        (a/<!! chan-done-request)        ;; finished the synchronous wrapper
        (a/>!! chan-finish-handle :done) ;; finish the asynchronous handler
        (a/<!! chan-done-request)        ;; finished the asynchronous wrapper
        (is (prometheus-test/approx= 1 (mt/metric-value system :jetty/request-time-max-seconds) 0.5))))))
