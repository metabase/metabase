(ns metabase.documents.collab.handler-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.documents.collab.handler :as collab.handler]))

(set! *warn-on-reflection* true)

(defn- call-handler
  "Synchronously invoke the 3-arg async handler, returning its `respond` value."
  [request]
  (let [responded (promise)
        raised    (promise)]
    (collab.handler/routes request #(deliver responded %) #(deliver raised %))
    (when (realized? raised) (throw (ex-info "raise called" {:e @raised})))
    @responded))

(defn- upgrade-request [path]
  {:request-method :get
   :uri            path
   :path-info      path
   :remote-addr    "127.0.0.1"
   :headers        {"connection" "Upgrade"
                    "upgrade"    "websocket"}})

(defn- plain-request [path]
  {:request-method :get
   :uri            path
   :path-info      path
   :remote-addr    "127.0.0.1"
   :headers        {}})

(deftest non-collab-path-passes-through-test
  (with-redefs [config/config-bool (constantly true)]
    (is (nil? (call-handler (upgrade-request "/some/other/path"))))))

(deftest flag-off-returns-404-test
  (with-redefs [config/config-bool (constantly false)]
    (let [resp (call-handler (upgrade-request "/collab"))]
      (is (= 404 (:status resp))))))

(deftest non-upgrade-request-returns-426-test
  (with-redefs [config/config-bool (constantly true)]
    (let [resp (call-handler (plain-request "/collab"))]
      (is (= 426 (:status resp))))))

(deftest upgrade-returns-websocket-listener-test
  (with-redefs [config/config-bool (constantly true)]
    (let [resp (call-handler (upgrade-request "/collab"))]
      (is (contains? resp :ring.websocket/listener))
      (let [listener (:ring.websocket/listener resp)]
        (is (map? listener))
        (is (every? listener [:on-open :on-message :on-close :on-error]))))))
