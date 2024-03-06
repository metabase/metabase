(ns metabase.api.geojson-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.api.geojson :as api.geojson]
   [metabase.http-client :as client]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [ring.adapter.jetty :as ring-jetty])
  (:import
   (org.eclipse.jetty.server Server)))

(set! *warn-on-reflection* true)

(def ^String test-geojson-url
  "URL of a GeoJSON file used for test purposes."
  "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/test.geojson")

(def ^:private ^String test-broken-geojson-url
  "URL of a GeoJSON file that is a valid URL but which cannot be connected to."
  "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/broken.geojson")

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

(deftest ^:parallel geojson-schema-test
  (is (@#'api.geojson/CustomGeoJSONValidator test-custom-geojson)))

(deftest ^:parallel validate-geojson-test
  (testing "It validates URLs and files appropriately"
    (let [examples {;; Internal metadata for GCP
                    "metadata.google.internal"                 false
                    "https://metadata.google.internal"         false
                    "//metadata.google.internal"               false
                    ;; Link-local addresses (internal metadata for AWS, OpenStack, and Azure)
                    "http://169.254.0.0"                       false
                    "http://fe80::"                            false
                    "169.254.169.254"                          false
                    "http://169.254.169.254/secret-stuff.json" false
                    ;; alternate IPv4 encodings (hex, octal, integer)
                    "http://0xa9fea9fe"                        false
                    "https://0xa9fea9fe"                       false
                    "http://0xA9FEA9FE"                        false
                    "http://0xa9.0xfe.0xa9.0xfe"               false
                    "http://0XA9.0XFE.0xA9.0XFE"               false
                    "http://0xa9fea9fe/secret-stuff.json"      false
                    "http://025177524776"                      false
                    "http://0251.0376.0251.0376"               false
                    "http://2852039166"                        false
                    ;; Prohibited protocols
                    "ftp://example.com/rivendell.json"         false
                    "example.com/rivendell.json"               false
                    "jar:file:test.jar!/test.json"             false
                    ;; Acceptable URLs
                    "http://example.com/"                      true
                    "https://example.com/"                     true
                    "http://example.com/rivendell.json"        true
                    "http://192.0.2.0"                         true
                    ;; this following test flakes in CI for unknown reasons
                    ;;"http://0xc0000200"                        true
                    ;; Resources (files on classpath) are valid
                    "c3p0.properties"                          true
                    ;; Other files are not
                    "./README.md"                              false
                    "file:///tmp"                              false
                    ;; Nonsense is invalid
                    "rasta@metabase.com"                       false
                    ""                                         false
                    "Tom Bombadil"                             false}
          valid?   #'api.geojson/validate-geojson]
      (doseq [[url should-pass?] examples]
        (let [geojson {:deadb33f {:name        "Rivendell"
                                  :url         url
                                  :region_key  nil
                                  :region_name nil}}]
          (if should-pass?
            (is (valid? geojson) (str url))
            (is (thrown? clojure.lang.ExceptionInfo (valid? geojson)) (str url))))))))

(deftest custom-geojson-disallow-overriding-builtins-test
  (testing "We shouldn't let people override the builtin GeoJSON and put weird stuff in there; ignore changes to them"
    (mt/with-temporary-setting-values [custom-geojson nil]
      (let [built-in (@#'api.geojson/builtin-geojson)]
        (testing "Make sure the built-in entries still look like what we expect so our test still makes sense."
          (is (=? {:us_states {:name "United States"}}
                  built-in))
          (is (= built-in
                 (api.geojson/custom-geojson))))
        (testing "Try to change one of the built-in entries..."
          (api.geojson/custom-geojson! (assoc-in built-in [:us_states :name] "USA"))
          (testing "Value should not have actually changed"
            (is (= built-in
                   (api.geojson/custom-geojson)))))))))

(deftest update-endpoint-test
  (testing "PUT /api/setting/custom-geojson"
    (testing "test that we can set the value of api.geojson/custom-geojson via the normal routes"
      (is (= (merge (@#'api.geojson/builtin-geojson) test-custom-geojson)
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
        (is (= (merge (@#'api.geojson/builtin-geojson) resource-geojson)
               (u/auto-retry 3
                 (mt/with-temporary-setting-values [custom-geojson nil]
                   (mt/user-http-request :crowberto :put 204 "setting/custom-geojson"
                                         {:value resource-geojson})
                   (mt/user-http-request :crowberto :get 200 "setting/custom-geojson")))))))))

(deftest ^:parallel url-proxy-endpoint-test
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
    (testing "cannot be called by non-admins"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "geojson" :url test-geojson-url))))))

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
  (testing "GET /api/geojson/:key"
    (mt/with-temporary-setting-values [custom-geojson test-custom-geojson]
      (testing "test the endpoint that fetches JSON files given a GeoJSON key"
        (is (= {:type        "Point"
                :coordinates [37.77986 -122.429]}
               (mt/user-http-request :rasta :get 200 "geojson/middle-earth"))))
      (testing "should be able to fetch the GeoJSON even if you aren't logged in"
        (is (= {:type        "Point"
                :coordinates [37.77986 -122.429]}
               (client/real-client :get 200 "geojson/middle-earth"))))
      (testing "try fetching an invalid key; should fail"
        (is (= "Invalid custom GeoJSON key: invalid-key"
               (mt/user-http-request :rasta :get 400 "geojson/invalid-key")))))
    (mt/with-temporary-setting-values [custom-geojson test-broken-custom-geojson]
      (testing "fetching a broken URL should fail"
        (is (= "GeoJSON URL failed to load"
               (mt/user-http-request :rasta :get 400 "geojson/middle-earth")))))))

(deftest set-custom-geojson-from-env-var-test
  (testing "Should be able to set the `custom-geojson` Setting via env var (#18862)"
    (mt/with-current-user (mt/user->id :crowberto) ;; need admin permissions to get admin-writable settings
      (let [custom-geojson {:custom_states
                            {:name        "Custom States"
                             :url         "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/us-states.json"
                             :region_key  "STATE"
                             :region_name "NAME"}}
            expected-value (merge (@#'api.geojson/builtin-geojson) custom-geojson)]
        (mt/with-temporary-setting-values [custom-geojson nil]
          (mt/with-temp-env-var-value! [mb-custom-geojson (json/generate-string custom-geojson)]
            (binding [setting/*disable-cache* true]
              (testing "Should parse env var custom GeoJSON and merge in"
                (is (= expected-value
                       (api.geojson/custom-geojson))))
              (testing "Env var value SHOULD NOT come back with [[setting/writable-settings]] -- should NOT be WRITABLE"
                (is (malli= [:map
                             [:key [:= :custom-geojson]]
                             [:value nil?]
                             [:is_env_setting [:= true]]
                             [:env_name       [:= "MB_CUSTOM_GEOJSON"]]
                             [:description    ms/NonBlankString]
                             [:default         [:= "Using value of env var $MB_CUSTOM_GEOJSON"]]]
                            (some
                             (fn [{setting-name :key, :as setting}]
                               (when (= setting-name :custom-geojson)
                                 setting))
                             (setting/writable-settings)))))
              (testing "Env var value SHOULD come back with [[setting/user-readable-values-map]] -- should be READABLE."
                (is (= expected-value
                       (get (setting/user-readable-values-map #{:public}) :custom-geojson)))))))))))

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
             (@#'api.geojson/builtin-geojson)))
      (is (= "Invalid custom GeoJSON key: us_states"
             (mt/user-real-request :crowberto :get 400 "geojson/us_states"))))))
