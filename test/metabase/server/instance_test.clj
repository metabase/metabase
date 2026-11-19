(ns metabase.server.instance-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt]
   [metabase.util :as u])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(deftest config-test
  (testing "Make sure our Jetty config functions work as expected/we don't accidentally break things (#9333)"
    (mt/with-dynamic-fn-redefs [config/config-str (constantly "10")
                                config/config-bool (constantly true)]
      (is (= {:keystore             "10"
              :max-queued           10
              :request-header-size  10
              :port                 10
              :min-threads          10
              :host                 "10"
              :daemon?              true
              :ssl?                 true
              :sni-host-check?      false
              :client-auth          :need
              :trust-password       "10"
              :key-password         "10"
              :truststore           "10"
              :max-threads          10
              :max-idle-time        10
              :stop-timeout         10
              :ssl-port             10
              :send-server-version? false}
             (#'server.instance/jetty-config))))))

(deftest ^:synchronized failed-start-stops-the-server-test
  (testing "a server whose start throws is stopped, and is not left as the instance"
    (let [stopped? (atom false)
          server   (proxy [org.eclipse.jetty.server.Server] []
                     (doStart [] (throw (ex-info "start failed" {})))
                     (doStop [] (reset! stopped? true)))]
      ;; a nil root, so this start does not find the test server already running
      (global-system.tu/with-root @#'server.instance/server-component nil
        (mt/with-dynamic-fn-redefs [server.instance/create-server (fn [_handler _config] server)]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"start failed"
                                (server.instance/start-web-server! (fn [_request respond _raise] (respond {})))))
          (is (= {:stopped? true, :instance nil}
                 {:stopped? @stopped?, :instance (server.instance/instance)})))))))

(deftest ^:synchronized failed-start-keeps-the-start-error-test
  (testing "when stopping a server whose start threw also throws, the start error is the one raised"
    (let [server (proxy [org.eclipse.jetty.server.Server] []
                   (doStart [] (throw (ex-info "start failed" {})))
                   (doStop [] (throw (ex-info "stop failed" {}))))
          thrown (global-system.tu/with-root @#'server.instance/server-component nil
                   (mt/with-dynamic-fn-redefs [server.instance/create-server (fn [_handler _config] server)]
                     (try
                       (server.instance/start-web-server! (fn [_request respond _raise] (respond {})))
                       nil
                       (catch Throwable e e))))]
      (is (= {:message "start failed", :suppressed ["stop failed"]}
             {:message    (ex-message thrown)
              :suppressed (mapv ex-message (.getSuppressed ^Throwable thrown))})))))

(deftest stop-timeout-test
  (testing "only a server given a stop timeout waits on stop; the app server gets one from its config"
    (let [handler (fn [_request respond _raise] (respond {:status 200}))]
      (is (= {:default 0, :given 1234, :app-config 4321}
             {:default    (.getStopTimeout (server.instance/create-server handler {:port 0}))
              :given      (.getStopTimeout (server.instance/create-server handler {:port 0, :stop-timeout 1234}))
              :app-config (mt/with-dynamic-fn-redefs [config/config-int #(when (= % :mb-jetty-stop-timeout) 4321)]
                            (:stop-timeout (#'server.instance/jetty-config)))})))))

(deftest stop-waits-for-requests-in-flight-test
  (testing "stopping the server lets a request already running finish"
    (let [started  (CountDownLatch. 1)
          finish   (CountDownLatch. 1)
          ;; responds from another thread after the handler returns, as streaming responses do
          handler  (fn [_request respond _raise]
                     (future
                       (.countDown started)
                       (.await finish 10 TimeUnit/SECONDS)
                       (respond {:status 200, :headers {}, :body "finished"})))
          server   (doto ^Server (server.instance/create-server handler {:port 0, :join? false, :stop-timeout 5000})
                     (.start))
          port     (.. server getURI getPort)
          response (future (http/get (format "http://localhost:%d/" port) {:throw-exceptions false}))]
      (try
        (is (.await started 10 TimeUnit/SECONDS))
        (let [stopped (future (.stop server))]
          ;; let the stop begin before the request finishes, so the request is in flight when it does
          (is (u/poll {:thunk       #(.isStopping server)
                       :done?       true?
                       :timeout-ms  5000
                       :interval-ms 10}))
          (.countDown finish)
          (is (= {:status 200, :body "finished"}
                 (select-keys (deref response 10000 nil) [:status :body])))
          (deref stopped 10000 nil)
          (is (.isStopped server)))
        (finally
          (.countDown finish)
          (.stop server))))))

(deftest stop-cuts-off-requests-after-the-stop-timeout-test
  (testing "a request that outlasts the stop timeout is cut off, and the stop does not throw"
    (let [started (CountDownLatch. 1)
          finish  (CountDownLatch. 1)
          handler (fn [_request respond _raise]
                    (future
                      (.countDown started)
                      (.await finish 10 TimeUnit/SECONDS)
                      (respond {:status 200, :headers {}, :body "too late"})))
          server  (doto ^Server (server.instance/create-server handler {:port 0, :join? false, :stop-timeout 100})
                    (.start))
          port    (.. server getURI getPort)]
      (try
        (future (http/get (format "http://localhost:%d/" port) {:throw-exceptions false}))
        (is (.await started 10 TimeUnit/SECONDS))
        ;; Jetty marks a stop that timed out as failed rather than stopped, but nothing is left running
        (is (= {:returned nil, :running? false}
               {:returned (#'server.instance/stop-server! server)
                :running? (.isRunning server)}))
        (finally
          (.countDown finish)
          (.stop server))))))
