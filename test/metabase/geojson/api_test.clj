(ns metabase.geojson.api-test
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.geojson.api :as api.geojson]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (java.net InetAddress)
   (org.apache.http.impl.conn InMemoryDnsResolver)
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(def ^String test-geojson-url
  "URL of a GeoJSON file used for test purposes."
  "https://metabase.com/test.geojson")

(def ^:private ^String test-broken-geojson-url
  "URL of a GeoJSON file that is a valid URL but which cannot be connected to."
  "https://metabase.com/broken.geojson")

(def ^:private ^String test-not-json-geojson-url
  "URL of a GeoJSON file that is a valid URL but responds with a wrong content type"
  "https://metabase.com/not-json.geojson")

(def ^:private ^String missing-content-type-url
  "URL of a GeoJSON file that is a valid URL but responds with a missing content type"
  "https://metabase.com/missing-content-type.geojson")

(def ^:private ^String test-geojson-body
  "Body of the GeoJSON file used for test purposes."
  "{\"type\": \"Point\", \"coordinates\": [37.77986, -122.429]}")

(def fake-routes
  {test-geojson-url          (constantly {:status  200
                                          :headers {:content-type "application/json"}
                                          :body    test-geojson-body})
   test-broken-geojson-url   (constantly {:status  404
                                          :headers {:content-type "text/plain"}
                                          :body    "oh no, not found!"})
   test-not-json-geojson-url (constantly {:status  200
                                          :headers {:content-type "application/html"}
                                          :body    "<h1>oops</h1>"})
   missing-content-type-url  (constantly {:status 200
                                          :headers {}
                                          :body    test-geojson-body})})

(defmacro with-geojson-mocks [& body]
  `(fake/with-fake-routes fake-routes
     ~@body))

(def ^:private test-custom-geojson
  {:middle-earth {:name        "Middle Earth"
                  :url         test-geojson-url
                  :builtin     true
                  :region_key  nil
                  :region_name nil}})

(def ^:private test-broken-custom-geojson
  {:middle-earth {:name        "Middle Earth"
                  :url         test-broken-geojson-url
                  :builtin     true
                  :region_key  nil
                  :region_name nil}})

(deftest update-endpoint-test
  (testing "PUT /api/setting/custom-geojson"
    (testing "test that we can set the value of geojson.settings/custom-geojson via the normal routes"
      (is (= (merge (@#'geojson.settings/builtin-geojson) test-custom-geojson)
             ;; try this up to 3 times since Circle's outbound connections likes to randomly stop working
             (u/auto-retry 3
               ;; bind a temporary value so it will get set back to its old value here after the API calls are done
               ;; stomping all over it
               (mt/with-temporary-setting-values [custom-geojson nil]
                 (mt/user-http-request :crowberto :put 204 "setting/custom-geojson" {:value test-custom-geojson})
                 (mt/user-http-request :crowberto :get 200 "setting/custom-geojson"))))))
    (testing "passing in an invalid URL" ; see above validation test
      (is (= (str "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to a file on the classpath. "
                  "URLs referring to hosts that supply internal hosting metadata are prohibited.")
             (mt/user-http-request :crowberto :put 400 "setting/custom-geojson"
                                   {:value {:mordor (assoc (first (vals test-custom-geojson))
                                                           :url "ftp://example.com")}}))))
    (testing "it accepts resources"
      (let [resource-geojson {(first (keys test-custom-geojson))
                              (assoc (first (vals test-custom-geojson))
                                     :url "c3p0.properties")}]
        (is (= (merge (@#'geojson.settings/builtin-geojson) resource-geojson)
               (u/auto-retry 3
                 (mt/with-temporary-setting-values [custom-geojson nil]
                   (mt/user-http-request :crowberto :put 204 "setting/custom-geojson"
                                         {:value resource-geojson})
                   (mt/user-http-request :crowberto :get 200 "setting/custom-geojson")))))))))

(deftest ^:parallel url-proxy-endpoint-test
  (with-geojson-mocks
    (testing "GET /api/geojson"
      (testing "test the endpoint that fetches JSON files given a URL"
        (is (= {:type        "Point"
                :coordinates [37.77986 -122.429]}
               (mt/user-http-request :crowberto :get 200 "geojson" :url test-geojson-url))))
      (testing "error is returned if URL connection fails"
        (is (= "GeoJSON URL failed to load"
               (mt/user-http-request :crowberto :get 400 "geojson"
                                     :url test-broken-geojson-url))))
      (testing "error is returned if URL is invalid"
        (is (= (str "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to "
                    "a file on the classpath. URLs referring to hosts that supply internal hosting metadata are "
                    "prohibited.")
               (mt/user-http-request :crowberto :get 400 "geojson" :url "file://tmp"))))
      (testing "error is returned if response is not JSON"
        (is (= "GeoJSON URL returned invalid content-type"
               (mt/user-http-request :crowberto :get 400 "geojson"
                                     :url test-not-json-geojson-url))))
      (testing "it's ok for the content-type header to be missing"
        (is (= {:type "Point" :coordinates [37.77986 -122.429]}
               (mt/user-http-request :crowberto :get 200 "geojson" :url missing-content-type-url))))
      (testing "cannot be called by non-admins"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "geojson" :url test-geojson-url)))))))

(defprotocol GeoJsonTestServer
  (-port [_]))

(defn- non-responding-server
  "Returns a server which accepts requests but never responds to them. Implements [[GeoJsonTestServer]] so you can
  call [[-port]] to get the port. Implements java.io.Closeable so can be used in a `with-open`."
  ^java.io.Closeable []
  (let [^Server server (ring-jetty/run-jetty (fn silent-async-handler
                                               [_request _respond _raise])
                                             {:join?         false
                                              :async?        true
                                              :port          0
                                              :async-timeout 60000})]
    (reify
      java.io.Closeable
      (close [_] (.stop server))

      GeoJsonTestServer
      (-port [_] (.. server getURI getPort)))))

(deftest url-proxy-endpoint-non-responding-server-test
  (testing "error is returned if URL server never responds (#28752)"
    (with-redefs [api.geojson/connection-timeout-ms 200]
      ;; use a webserver which accepts a connection and never responds. The geojson endpoint opens a reader to the url
      ;; and responds with it. And if there are never any bytes going across, the whole thing just sits there. Our
      ;; test flakes after 45 seconds with `mt/user-http-request` times out. And presumably other clients have similar
      ;; issues. This ensures we give a good error message in this case.
      (with-open [server (non-responding-server)]
        (let [never-responds-url (str "http://localhost:" (-port server))]
          (testing "error is returned if URL connection fails"
            (is (= "GeoJSON URL failed to load"
                   (mt/user-http-request :crowberto :get 400 "geojson"
                                         :url never-responds-url)))))))))

(deftest key-proxy-endpoint-test
  (with-geojson-mocks
    (testing "GET /api/geojson/:key"
      (mt/with-temporary-setting-values [custom-geojson test-custom-geojson]
        (testing "test the endpoint that fetches JSON files given a GeoJSON key"
          (is (= {:type        "Point"
                  :coordinates [37.77986 -122.429]}
                 (mt/user-http-request :rasta :get 200 "geojson/middle-earth"))))
        (testing "should be able to fetch the GeoJSON even if you aren't logged in"
          (is (= {:type        "Point"
                  :coordinates [37.77986 -122.429]}
                 (client/client :get 200 "geojson/middle-earth"))))
        (testing "try fetching an invalid key; should fail"
          (is (= "Invalid custom GeoJSON key: invalid-key"
                 (mt/user-http-request :rasta :get 400 "geojson/invalid-key")))))
      (mt/with-temporary-setting-values [custom-geojson test-broken-custom-geojson]
        (testing "fetching a broken URL should fail"
          (is (= "GeoJSON URL failed to load"
                 (mt/user-http-request :rasta :get 400 "geojson/middle-earth"))))))))

(deftest disable-custom-geojson-test
  (testing "Should be able to disable GeoJSON proxying endpoints by env var"
    (mt/with-temporary-setting-values [custom-geojson test-custom-geojson]
      (mt/with-temp-env-var-value! [mb-custom-geojson-enabled false]
        (testing "Should not be able to fetch GeoJSON via URL proxy endpoint"
          (is (= "Custom GeoJSON is not enabled"
                 (mt/user-real-request :crowberto :get 400 "geojson" :url test-geojson-url))))
        (testing "Should not be able to fetch custom GeoJSON via key proxy endpoint"
          (is (= "Custom GeoJSON is not enabled"
                 (mt/user-real-request :crowberto :get 400 "geojson/middle-earth"))))))))

(deftest disable-default-maps-test
  (testing "Should be able to disable the default GeoJSON maps by env var"
    (mt/with-temp-env-var-value! [mb-default-maps-enabled false]
      (is (= {}
             (@#'geojson.settings/builtin-geojson)))
      (is (= "Invalid custom GeoJSON key: us_states"
             (mt/user-real-request :crowberto :get 400 "geojson/us_states"))))))

(deftest resolver-disallows-link-local-geojson-attack
  (testing "Should block link local dns resolution"
    (binding [api.geojson/*system-dns-resolver* (doto (InMemoryDnsResolver.)
                                                  (.add "metabase.com"
                                                        (into-array [(InetAddress/getByAddress (byte-array [1 1 1 1]))
                                                                     (InetAddress/getByAddress (byte-array [169 254 169 254]))])))]
      (is (= (str "Invalid GeoJSON file location: must either start with http:// or https:// or be a relative path to "
                  "a file on the classpath. URLs referring to hosts that supply internal hosting metadata are "
                  "prohibited.")
             (mt/user-http-request :crowberto :get 400 "geojson" :url test-geojson-url))))))
