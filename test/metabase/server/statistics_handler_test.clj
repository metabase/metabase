(ns metabase.server.statistics-handler-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [compojure.core :as compojure :refer #_{:clj-kondo/ignore [:discouraged-var]} [GET]]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(defn routes
  [hold-chan hit-chan]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (compojure/routes
   (GET "/sync" [] {:status 200 :headers {} :body "you got it sync"})
   (GET "/hold" []
     (a/>!! hit-chan :hit)
     (let [timeout (a/timeout 500)
           [ch _val] (a/alts!! [hold-chan timeout])]
       (if (= ch timeout)
         (throw (ex-info "We timed out!" {}))
         {:status 200 :headers {} :body "you got held"})))
   (GET "/async" []
     (fn [_req respond _raise]
       (respond {:status 200 :headers {} :body "you got it async"})))
   (GET "/blowup" []
     (throw (ex-info "Kaboom. you get a 500" {})))
   (GET "/reroute" []
     {:status 301 :headers {"Location" "http://localhost:3000/app"} :body "go somewher else"})))

(defmacro with-server
  [[hold-chan hit-chan] f]
  `(let [^Server server# (doto (server.instance/create-server (routes ~hold-chan ~hit-chan) {:port 0 :join? false})
                           (.start))
         port# (.. server# getURI getPort)
         wait# (promise)]
     (~f server# port#)
     (.stop server#)))

(deftest server-stats-test
  (mt/with-prometheus-system! [_ system]
    (let [hold-chan (a/chan)
          hit-chan (a/chan)
          value! (fn value! [& metric-args]
                   (apply mt/metric-value system metric-args))]
      (with-server [hold-chan hit-chan]
        (fn [_server port]
          (testing "async"
            (let [route (format "http://localhost:%d/sync" port)]
              (is (= 200 (:status (http/get route))))
              (is (prometheus-test/approx= 1 (value! :jetty/requests-total)))
              (is (prometheus-test/approx= 1 (value! :jetty/dispatched-total)))
              (is (prometheus-test/approx= 1 (value! :jetty/dispatched-active-max)))
              (is (prometheus-test/approx= 1 (value! :jetty/dispatched-total)))
              (is (prometheus-test/approx= 0 (value! :jetty/dispatched-active)))
              (is (prometheus-test/approx= 1 (value! :jetty/dispatched-active-max)))
              (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "2xx"})))))
          (testing "requests active"
            (let [route (format "http://localhost:%d/hold" port)]
              (future
                ;; this will wait on the hold chan
                (is (= 200 (:status (http/get route))))
                (is (prometheus-test/approx= 0 (value! :jetty/requests-active)))
                (is (prometheus-test/approx= 0 (value! :jetty/dispatched-active))))
              (let [timeout (a/timeout 500)
                    [ch _v] (a/alts!! [hit-chan timeout])]
                (is (not= ch timeout) "We timed out!")
                (is (prometheus-test/approx= 1 (value! :jetty/requests-active)))
                (is (prometheus-test/approx= 1 (value! :jetty/dispatched-active)))
                (a/>!! hold-chan :continue))))
          (testing "300"
            (testing "when server responds 300"
              (let [route (format "http://localhost:%d/reroute" port)]
                (http/get route {:redirect-strategy :none})
                (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "3xx"}))))))
          (testing "500"
            (testing "when server responds 500"
              (let [route (format "http://localhost:%d/blowup" port)]
                (http/get route {:throw-exceptions false})
                (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "5xx"})))))))))))
