(ns metabase.server.instance-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt]))

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
