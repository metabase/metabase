(ns metabase.server.instance-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt])
  (:import
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
              :ssl-port             10
              :send-server-version? false}
             (#'server.instance/jetty-config))))))

(defn- do-with-echo-uri-server
  "Start a server that echoes the raw `:uri` it receives, and call `(f get-path)` where `get-path` GETs a
  path on the server and returns the clj-http response."
  [f]
  (let [^Server server (doto (server.instance/create-server
                              (fn [request respond _raise]
                                (respond {:status 200, :headers {"Content-Type" "text/plain"}, :body (:uri request)}))
                              {:port 0, :join? false})
                         (.start))
        port           (.. server getURI getPort)]
    (try
      (f (fn get-path [path]
           (http/get (format "http://localhost:%d%s" port path) {:throw-exceptions false})))
      (finally
        (.stop server)))))

(deftest uri-compliance-test
  (do-with-echo-uri-server
   (fn [get-path]
     (testing "percent-encoded slashes (%2F) in the path should be allowed — schema names can contain slashes (#77353)"
       (let [response (get-path "/api/database/1/schema/public%2Ftransactions")]
         (is (= 200 (:status response)))
         (testing "and the URI should reach the handler still encoded, so route matching is unaffected"
           (is (= "/api/database/1/schema/public%2Ftransactions" (:body response))))))
     (testing "other ambiguous-URI protections should remain in effect"
       (testing "ambiguous path encoding (%25)"
         (is (= 400 (:status (get-path "/api/x/a%25b")))))
       (testing "suspicious path characters (%5C)"
         (is (= 400 (:status (get-path "/api/x/a%5Cb")))))
       (testing "ambiguous path segments (%2e%2e)"
         (is (= 400 (:status (get-path "/api/%2e%2e/secret")))))))))
