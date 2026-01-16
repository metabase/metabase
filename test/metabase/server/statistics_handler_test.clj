(ns metabase.server.statistics-handler-test
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.test :refer [deftest is testing]]
   [compojure.core :as compojure :refer #_{:clj-kondo/ignore [:discouraged-var]} [GET]]
   [compojure.route :as route]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.server.instance :as server.instance]
   [metabase.test :as mt])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(defn- routes []
  #_{:clj-kondo/ignore [:discouraged-var]}
  (compojure/routes
   (GET "/route" []
     (fn [_req respond _raise]
       (respond {:status 200 :headers {} :body "just a route"})))
   (GET "/blowup" []
     (throw (ex-info "Kaboom. you get a 500" {})))
   (GET "/reroute" []
     {:status 301 :headers {"Location" "http://localhost:3000/app"} :body "go somewher else"})
   (route/not-found {:status 404 :body "not found"})))

(deftest server-stats-test
  (mt/with-prometheus-system! [_ system]
    (let [value! (fn value! [& metric-args]
                   (apply mt/metric-value system metric-args))
          ^Server server (doto (server.instance/create-server (routes)
                                                              {:port 0 :join? false})
                           (.start))
          port (.. server getURI getPort)]
      (try
        (is (= 200 (:status (http/get (format "http://localhost:%d/route" port)))))
        (is (= 301 (:status (http/get (format "http://localhost:%d/reroute" port)
                                      {:redirect-strategy :none}))))
        (is (= 404 (:status (http/get (format "http://localhost:%d/unknown" port)
                                      {:throw-exceptions false}))))
        (is (= 500 (:status (http/get (format "http://localhost:%d/blowup" port)
                                      {:throw-exceptions false}))))
        (is (prometheus-test/approx= 4 (value! :jetty/requests-total)))
        (is (prometheus-test/approx= 4 (value! :jetty/dispatched-total)))
        (is (prometheus-test/approx= 1 (value! :jetty/dispatched-active-max)))
        (is (prometheus-test/approx= 0 (value! :jetty/dispatched-active)))
        (is (prometheus-test/approx= 1 (value! :jetty/dispatched-active-max)))
        (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "2xx"})))
        (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "3xx"})))
        (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "4xx"})))
        (is (prometheus-test/approx= 1 (value! :jetty/responses-total {:code "5xx"})))
        (finally (.stop server))))))
