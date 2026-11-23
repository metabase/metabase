(ns metabase.geojson.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.geojson.settings :as geojson.settings]
   [metabase.premium-features.test-util :as premium-features.tu]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]))

(def ^String test-geojson-url
  "URL of a GeoJSON file used for test purposes."
  "https://metabase.com/test.geojson")

(def ^:private test-custom-geojson
  {:middle-earth {:name        "Middle Earth"
                  :url         test-geojson-url
                  :builtin     true
                  :region_key  nil
                  :region_name nil}})

(deftest ^:parallel geojson-schema-test
  (is (@#'geojson.settings/CustomGeoJSONValidator test-custom-geojson)))

(deftest ^:parallel builtin-region-geojson-test
  (testing "Built-in regions resolve to parsed GeoJSON data read from the classpath"
    (let [us (geojson.settings/builtin-region-geojson "us_states")]
      (is (= "STATE" (:region_key us)))
      (is (= "NAME" (:region_name us)))
      (is (= "FeatureCollection" (get-in us [:data "type"])))
      (is (pos? (count (get-in us [:data "features"])))))
    (let [world (geojson.settings/builtin-region-geojson "world_countries")]
      (is (= "ISO_A2" (:region_key world)))
      (is (pos? (count (get-in world [:data "features"]))))))
  (testing "Keyword region keys are accepted"
    (is (some? (geojson.settings/builtin-region-geojson :us_states))))
  (testing "Unknown / non-built-in regions return nil"
    (is (nil? (geojson.settings/builtin-region-geojson "narnia")))
    (is (nil? (geojson.settings/builtin-region-geojson nil)))))

(defn- valid-geojson-url?
  "Whether a custom map with GeoJSON at `url` may be saved."
  [url]
  (let [geojson {:deadb33f {:name "Rivendell" :url url :region_key nil :region_name nil}}]
    (try
      (#'geojson.settings/validate-geojson geojson geojson)
      true
      (catch clojure.lang.ExceptionInfo _ false))))

(deftest validate-geojson-test
  (testing "It validates URLs and files appropriately (classpath resources disabled by default)"
    (mt/with-temp-env-var-value! [mb-geojson-allowed-networks "external-only"]
      (let [examples {;; Internal metadata for GCP
                      "metadata.google.internal"                 false
                      "https://metadata.google.internal"         false
                      "//metadata.google.internal"               false
                      ;; Link-local addresses (internal metadata for AWS, OpenStack, and Azure)
                      "http://169.254.0.0"                       false
                      "http://fe80::"                            false
                      "169.254.169.254"                          false
                      "http://169.254.169.254/secret-stuff.json" false
                      "http://0.0.0.0"                           false
                      "http://[::]"                              false
                      "http://100.64.0.1"                        false
                      "http://[fc00::1]"                         false
                      ;; Special-purpose addresses that are not globally reachable
                      "http://192.0.2.0"                         false
                      "http://198.18.0.1"                        false
                      "http://[2001:db8::1]"                     false
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
                      "http://8.8.8.8"                           true
                      ;; this following test flakes in CI for unknown reasons
                      ;;"http://0xc0000200"                        true
                      ;; Classpath resources are NOT valid when env var is not set
                      "test.geojson"                             false
                      ;; Other files are not
                      "./README.md"                              false
                      "file:///tmp"                              false
                      ;; Nonsense is invalid
                      "rasta@metabase.com"                       false
                      ""                                         false
                      "Tom Bombadil"                             false}
            valid?   #'geojson.settings/validate-geojson]
        (doseq [[url should-pass?] examples]
          (let [geojson {:deadb33f {:name        "Rivendell"
                                    :url         url
                                    :region_key  nil
                                    :region_name nil}}]
            (if should-pass?
              (is (valid? geojson geojson) (str url))
              (is (thrown? clojure.lang.ExceptionInfo (valid? geojson geojson)) (str url)))))))))

(deftest geojson-allowed-networks-default-test
  (testing "the default policy depends on where we are running: on Cloud a GeoJSON file on an internal address is
           somebody reaching for our infrastructure, but self-hosted it is ordinary"
    (mt/with-temp-env-var-value! [mb-geojson-allowed-networks nil]
      (premium-features.tu/with-premium-features #{:hosting}
        (is (= :external-only (geojson.settings/geojson-allowed-networks))))
      (premium-features.tu/with-premium-features #{}
        (is (= :allow-private (geojson.settings/geojson-allowed-networks)))))
    (testing "an explicit value wins either way"
      (mt/with-temp-env-var-value! [mb-geojson-allowed-networks "allow-all"]
        (premium-features.tu/with-premium-features #{:hosting}
          (is (= :allow-all (geojson.settings/geojson-allowed-networks))))))
    (testing "an unrecognized policy is refused outright"
      (mt/with-temp-env-var-value! [mb-geojson-allowed-networks "allow-everything"]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid MB_GEOJSON_ALLOWED_NETWORKS"
                              (geojson.settings/geojson-allowed-networks)))))))

(deftest geojson-allowed-networks-is-environment-only-test
  (testing "the policy is read from the environment only: a value in the setting table is ignored"
    (mt/with-temp-env-var-value! [mb-geojson-allowed-networks nil]
      (premium-features.tu/with-premium-features #{:hosting}
        (mt/with-temporary-raw-setting-values [geojson-allowed-networks "allow-all"]
          (is (= :external-only (geojson.settings/geojson-allowed-networks))))))))

(deftest validate-geojson-allows-private-networks-self-hosted-test
  (testing "self-hosted, GeoJSON on the deployment's own network is a legitimate configuration"
    (premium-features.tu/with-premium-features #{}
      (mt/with-temp-env-var-value! [mb-geojson-allowed-networks nil]
        (doseq [url ["http://10.0.0.1/regions.geojson"
                     "http://192.168.0.1:8080/regions.geojson"
                     "http://172.16.4.20/regions.geojson"
                     "http://100.64.0.1/regions.geojson"
                     "http://[fc00::1]/regions.geojson"
                     "https://example.com/regions.geojson"]]
          (testing url
            (is (valid-geojson-url? url))))
        (testing "loopback, link-local and unresolvable hosts are still refused"
          (doseq [url ["http://127.0.0.1/regions.geojson"
                       "http://localhost/regions.geojson"
                       "http://[::1]/regions.geojson"
                       "http://169.254.169.254/latest/meta-data"
                       "http://0xa9fea9fe/regions.geojson"
                       "http://metadata.google.internal/regions.geojson"]]
            (testing url
              (is (not (valid-geojson-url? url)))))))))
  (testing "on Cloud the same private URLs are refused"
    (premium-features.tu/with-premium-features #{:hosting}
      (mt/with-temp-env-var-value! [mb-geojson-allowed-networks nil]
        (is (not (valid-geojson-url? "http://10.0.0.1/regions.geojson")))
        (is (valid-geojson-url? "https://example.com/regions.geojson"))))))

(deftest validate-geojson-allow-all-test
  (testing "allow-all imposes no host restriction"
    (mt/with-temp-env-var-value! [mb-geojson-allowed-networks "allow-all"]
      (doseq [url ["http://127.0.0.1:8899/regions.geojson"
                   "http://geo.invalid/regions.geojson"]]
        (testing url
          (is (valid-geojson-url? url))))
      (testing "the scheme is still checked"
        (is (not (valid-geojson-url? "file:///etc/passwd")))
        (is (not (valid-geojson-url? "ftp://example.com/regions.geojson")))))))

(deftest classpath-geojson-env-var-test
  (testing "When MB_ALLOW_CLASSPATH_GEOJSON is true"
    (mt/with-temp-env-var-value! [mb-allow-classpath-geojson "true"]
      (testing "classpath resources are accepted"
        (let [geojson {:deadb33f {:name "Test" :url "test.geojson" :region_key nil :region_name nil}}]
          (is (#'geojson.settings/validate-geojson geojson geojson))))))
  (testing "When MB_ALLOW_CLASSPATH_GEOJSON is not set, classpath resources are rejected"
    (let [geojson {:deadb33f {:name "Test" :url "test.geojson" :region_key nil :region_name nil}}]
      (is (thrown? clojure.lang.ExceptionInfo (#'geojson.settings/validate-geojson geojson geojson))))))

(deftest custom-geojson-disallow-overriding-builtins-test
  (testing "We shouldn't let people override the builtin GeoJSON and put weird stuff in there; ignore changes to them"
    (mt/with-temporary-setting-values [custom-geojson nil]
      (let [built-in (@#'geojson.settings/builtin-geojson)]
        (testing "Make sure the built-in entries still look like what we expect so our test still makes sense."
          (is (=? {:us_states {:name "United States"}}
                  built-in))
          (is (= built-in
                 (geojson.settings/custom-geojson))))
        (testing "Try to change one of the built-in entries..."
          (geojson.settings/custom-geojson! (assoc-in built-in [:us_states :name] "USA"))
          (testing "Value should not have actually changed"
            (is (= built-in
                   (geojson.settings/custom-geojson)))))))))

(deftest set-custom-geojson-from-env-var-test
  (testing "Should be able to set the `custom-geojson` Setting via env var (#18862)"
    (mt/with-current-user (mt/user->id :crowberto) ;; need admin permissions to get admin-writable settings
      (let [custom-geojson {:custom_states
                            {:name        "Custom States"
                             :url         "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/us-states.json"
                             :region_key  "STATE"
                             :region_name "NAME"}}
            expected-value (merge (@#'geojson.settings/builtin-geojson) custom-geojson)]
        (mt/with-temporary-setting-values [custom-geojson nil]
          (mt/with-temp-env-var-value! [mb-custom-geojson (json/encode custom-geojson)]
            (binding [config/*disable-setting-cache* true]
              (testing "Should parse env var custom GeoJSON and merge in"
                (is (= expected-value
                       (geojson.settings/custom-geojson))))
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

(deftest unchanged-url-validation-test
  (testing "Unchanged URLs should not be re-validated when saving other changes (#44353)"
    (mt/with-temporary-setting-values [custom-geojson nil]
      (let [unreachable-url "http://hostname.invalid/map.geojson"
            existing-entry  {:existing {:name        "Existing Map"
                                        :url         unreachable-url
                                        :region_key  nil
                                        :region_name nil}}
            new-entry       {:new-map {:name        "New Map"
                                       :url         "https://example.com/valid.geojson"
                                       :region_key  nil
                                       :region_name nil}}]
        (setting/set-value-of-type! :json :custom-geojson existing-entry)
        (testing "Adding a new entry with a valid URL should succeed even if an existing entry has an unreachable URL"
          (geojson.settings/custom-geojson! (merge existing-entry new-entry)))
        (testing "The new entry was saved correctly"
          (is (= (merge (@#'geojson.settings/builtin-geojson) existing-entry new-entry)
                 (geojson.settings/custom-geojson))))
        (testing "Updating properties other than URL on an existing entry should succeed"
          (let [updated-existing {:existing {:name        "Updated Existing Map"
                                             :url         unreachable-url
                                             :region_key  "NEW_KEY"
                                             :region_name "New Name"}}]
            (geojson.settings/custom-geojson! (merge updated-existing new-entry))
            (is (= (merge (@#'geojson.settings/builtin-geojson) updated-existing new-entry)
                   (geojson.settings/custom-geojson)))))
        (testing "Changing the URL of an existing entry SHOULD trigger validation"
          (let [changed-url-entry {:existing {:name        "Updated Existing Map"
                                              :url         "http://also.invalid/map.geojson"
                                              :region_key  "NEW_KEY"
                                              :region_name "New Name"}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Invalid GeoJSON"
                 (geojson.settings/custom-geojson! (merge changed-url-entry new-entry))))))))))
