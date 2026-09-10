(ns metabase.tiles.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.premium-features.test-util :as premium-features.tu]
   [metabase.test :as mt]
   [metabase.tiles.settings :as tiles.settings]))

(def ^:private osm-template "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")

(defn- set-tile-url!
  "Set the tile URL, returning the value actually stored."
  [template]
  (tiles.settings/map-tile-server-url! template)
  (tiles.settings/map-tile-server-url))

(deftest map-tile-server-url-rejects-unreachable-hosts-test
  (testing "under the default policy the setter refuses loopback, link-local, and unresolvable hosts"
    (mt/with-temporary-setting-values [map-tile-server-url osm-template]
      (doseq [template ["http://127.0.0.1:8899/{z}/{x}/{y}.png"
                        "http://localhost:8899/{z}/{x}/{y}.png"
                        "http://[::1]/{z}/{x}/{y}.png"
                        "http://169.254.169.254/{z}/{x}/{y}.png"      ; cloud metadata
                        "http://0xa9fea9fe/{z}/{x}/{y}.png"           ; the same, in hex
                        ;; a host that resolves to nothing is not trusted either -- that is how the
                        ;; obfuscated literal above presents itself on a modern JDK
                        "https://tiles.invalid/{z}/{x}/{y}.png"
                        "ftp://example.com/{z}/{x}/{y}.png"
                        "file:///etc/passwd"]]
        (testing template
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid map tile server URL"
                                (tiles.settings/map-tile-server-url! template)))
          (is (= osm-template (tiles.settings/map-tile-server-url))
              "the rejected value is not stored"))))))

(deftest map-tile-server-allowed-networks-default-test
  (testing "the default policy depends on where we are running: on Cloud a tile server on an internal
           address is somebody reaching for our infrastructure, but self-hosted it is ordinary"
    ;; nil = nothing stored, so the getter falls through to the where-are-we-running default
    (mt/with-temporary-setting-values [map-tile-server-allowed-networks nil]
      (premium-features.tu/with-premium-features #{:hosting}
        (is (= :external-only (tiles.settings/map-tile-server-allowed-networks))))
      (premium-features.tu/with-premium-features #{}
        (is (= :allow-private (tiles.settings/map-tile-server-allowed-networks)))))
    (testing "an explicit value wins either way"
      (mt/with-temporary-setting-values [map-tile-server-allowed-networks :allow-all]
        (premium-features.tu/with-premium-features #{:hosting}
          (is (= :allow-all (tiles.settings/map-tile-server-allowed-networks))))))))

(deftest map-tile-server-url-allows-private-tile-servers-test
  (testing "self-hosted, a tile server on the deployment's own network is a long-standing, legitimate
           configuration: this setting is consumed by the browser, so an on-prem instance with no internet
           egress can only show maps at all by pointing at an internal host"
    (premium-features.tu/with-premium-features #{}
      (mt/with-temporary-setting-values [map-tile-server-url              osm-template
                                         map-tile-server-allowed-networks nil]
        (doseq [template ["http://10.0.0.1/{z}/{x}/{y}.png"
                          "http://192.168.0.1:8080/{z}/{x}/{y}.png"
                          "http://172.16.4.20/{z}/{x}/{y}.png"]]
          (testing template
            (is (= template (set-tile-url! template))))))))
  (testing "on Cloud the same URLs are refused"
    (premium-features.tu/with-premium-features #{:hosting}
      (mt/with-temporary-setting-values [map-tile-server-url              osm-template
                                         map-tile-server-allowed-networks nil]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid map tile server URL"
                              (tiles.settings/map-tile-server-url! "http://10.0.0.1/{z}/{x}/{y}.png")))))))

(deftest map-tile-server-url-accepts-valid-templates-test
  (testing "the setter still accepts the templates admins legitimately configure"
    (mt/with-temporary-setting-values [map-tile-server-url osm-template]
      (doseq [template [osm-template
                        "http://192.0.2.0/{z}/{x}/{y}.png"                           ; public IP literal
                        "https://example.com:8443/{z}/{x}/{y}.png?apikey=SEKRIT"
                        "/local/{z}/{x}/{y}.png"]]                                   ; same-origin, browser-only
        (testing template
          (is (= template (set-tile-url! template)))))
      (testing "clearing the setting falls back to the default"
        (tiles.settings/map-tile-server-url! nil)
        (is (= osm-template (tiles.settings/map-tile-server-url)))))))

(deftest map-tile-server-allowed-networks-test
  (mt/with-temporary-setting-values [map-tile-server-url osm-template]
    (testing "external-only tightens the default, rejecting private networks"
      (mt/with-temporary-setting-values [map-tile-server-allowed-networks :external-only]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid map tile server URL"
                              (tiles.settings/map-tile-server-url! "http://10.0.0.1/{z}/{x}/{y}.png")))
        (is (= osm-template (set-tile-url! osm-template)))))
    (testing "allow-all imposes no host restriction, for a tile server Metabase itself cannot resolve"
      (mt/with-temporary-setting-values [map-tile-server-allowed-networks :allow-all]
        (doseq [template ["http://127.0.0.1:8899/{z}/{x}/{y}.png"
                          "https://tiles.invalid/{z}/{x}/{y}.png"]]
          (testing template
            (is (= template (set-tile-url! template)))))
        (testing "the scheme is still checked"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid map tile server URL"
                                (tiles.settings/map-tile-server-url! "file:///etc/passwd"))))))
    (testing "only the three known values are accepted"
      (is (thrown-with-msg? java.lang.AssertionError #"Invalid map-tile-server-allowed-networks"
                            (tiles.settings/map-tile-server-allowed-networks! :allow-everything))))))
