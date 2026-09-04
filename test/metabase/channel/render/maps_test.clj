(ns metabase.channel.render.maps-test
  (:require
   [clj-http.fake :as fake]
   [clojure.test :refer :all]
   [metabase.channel.render.body :as body]
   [metabase.channel.render.maps :as maps]
   [metabase.pulse.render.test-util :as render.tu]
   [metabase.test :as mt]
   [metabase.util.http :as u.http]
   [metabase.util.match :as match])
  (:import
   (java.awt Color)
   (java.io ByteArrayInputStream)
   (javax.imageio ImageIO)))

(set! *warn-on-reflection* true)

(def ^:private test-sizing-opts
  {:min-width  400
   :min-height 300
   :max-width  600
   :max-height 400})

(defn- assert-png-within-bounds
  "Assert that `png` decodes to an image whose dimensions fall within [[test-sizing-opts]]."
  [^bytes png]
  (let [img (ImageIO/read (ByteArrayInputStream. png))]
    (is (pos? (count png)))
    (is (<= (:min-width test-sizing-opts)  (.getWidth img)  (:max-width test-sizing-opts)))
    (is (<= (:min-height test-sizing-opts) (.getHeight img) (:max-height test-sizing-opts)))))

(deftest render-pin-map-test
  (testing "renders a PNG (sized to the data, within bounds) from points + (mocked) basemap tiles"
    (fake/with-fake-routes (render.tu/fake-tile-routes #"https://.*\.tile\.example\.com/.*")
      (assert-png-within-bounds
       (maps/render-pin-map [[37.7749 -122.4194] [40.7128 -74.0060]]
                            (assoc test-sizing-opts
                                   :tile-url "https://{s}.tile.example.com/{z}/{x}/{y}.png"))))))

(deftest render-grid-map-test
  (testing "renders binned cells onto a (mocked) basemap, sized to the data within bounds"
    (fake/with-fake-routes (render.tu/fake-tile-routes #"https://.*tile\.openstreetmap\.org/.*")
      (assert-png-within-bounds
       (maps/render-grid-map [{:lat     30
                               :lon     -120
                               :lat-bin 4
                               :lon-bin 6
                               :metric  1}
                              {:lat     38
                               :lon     -90
                               :lat-bin 4
                               :lon-bin 6
                               :metric  9}]
                             (assoc test-sizing-opts
                                    :tile-url "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"))))))

(deftest render-region-map-test
  (mt/id) ;; force the app-db test dataset to exist; the render pipeline queries it for timeline annotations
  (testing "A region (choropleth) map card renders to an image, not a leaked-data table"
    (let [card {:display :map :visualization_settings {"map.type" "region" "map.region" "us_states"}}
          data {:cols [{:name "STATE" :base_type :type/Text} {:name "METRIC" :base_type :type/Number}]
                :rows [["CA" 99999] ["NY" 11111]]}
          rendered (body/render :region_map :inline "UTC" card nil data)]
      (is (match/match-one (:content rendered) [:img _] true)))))

(deftest ^:parallel pin-marker-icon-loads-test
  (testing "the teardrop pin marker icon is present on the classpath (markers pin type depends on it)"
    (is (some? (deref @#'maps/pin-marker-icon)))))

(deftest ^:parallel grid-color-endpoints-test
  (testing "the grid color scale runs green (low) to red (high)"
    (let [grid-color  @#'maps/grid-color
          ^Color low  (grid-color 0.0 0.0 10.0)
          ^Color high (grid-color 10.0 0.0 10.0)]
      (is (> (.getGreen low) (.getRed low)) "low end is greenish")
      (is (> (.getRed high) (.getGreen high)) "high end is reddish"))))

(deftest fetch-tile-refuses-internal-hosts-test
  (testing "under external-only (what Metabase Cloud gets) an internal tile URL is never requested —
           map-tile-server-url is admin-settable, so a raw GET here would be a blind SSRF sink reachable
           from any subscription render"
    (mt/with-temporary-setting-values [map-tile-server-allowed-networks :external-only]
      (let [requested (atom [])]
        (fake/with-fake-routes {#".*" (fn [req]
                                        (swap! requested conj (:url req))
                                        {:status 200 :headers {} :body (render.tu/blank-tile-png)})}
          (doseq [template ["http://127.0.0.1:8899/{z}/{x}/{y}.png"
                            "http://localhost:8899/{z}/{x}/{y}.png"
                            "http://169.254.169.254/{z}/{x}/{y}.png"
                            "http://10.0.0.1/{z}/{x}/{y}.png"
                            ;; http is not fetched server-side either: under this policy the hardened
                            ;; client is https-only
                            "http://tile.example.com/{z}/{x}/{y}.png"]]
            (testing template
              (is (nil? (#'maps/fetch-tile template 3 4 2)))))
          (is (empty? @requested)
              "the JVM issued no outbound request at all"))))))

(deftest fetch-tile-honors-allow-private-test
  (testing "under allow-private (the self-hosted default) a tile server on the deployment's own network is
           fetched, so a URL an admin is allowed to save is one subscription renders can actually reach"
    (mt/with-temporary-setting-values [map-tile-server-allowed-networks :allow-private]
      (fake/with-fake-routes (render.tu/fake-tile-routes #"http://tiles\.internal/.*")
        (is (some? (#'maps/fetch-tile "http://tiles.internal/{z}/{x}/{y}.png" 3 4 2))))))
  (testing "loopback and cloud metadata are still refused — by the policy's DNS resolver at connect time,
           which clj-http-fake would bypass, so assert on the policy itself"
    ;; only hosts that certainly resolve: an unresolvable host is deliberately *allowed* by the policy
    ;; check (a DNS outage should surface as a connection error, not an accusation)
    (doseq [host ["127.0.0.1" "localhost" "169.254.169.254"]]
      (testing host
        (is (false? (u.http/host-allowed-for-network-policy? :allow-private host)))))
    (is (true? (u.http/host-allowed-for-network-policy? :allow-private "10.0.0.1")))))

(deftest fetch-tile-fetches-public-tiles-test
  (testing "a public https tile server is still fetched"
    (fake/with-fake-routes (render.tu/fake-tile-routes #"https://.*\.tile\.example\.com/.*")
      (is (some? (#'maps/fetch-tile "https://{s}.tile.example.com/{z}/{x}/{y}.png" 5 4 2))))))
