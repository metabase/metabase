(ns metabase.channel.render.js.remote-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.channel.render.js.remote :as remote]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.retry :as retry]))

(set! *warn-on-reflection* true)

(deftest remote-renderer-test
  (testing "each method POSTs its args map to the matching endpoint and returns the response body"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [http/post (fn [url opts]
                                              (swap! calls conj [url (json/decode+kw (:body opts))])
                                              {:body "RENDERED"})]
        (let [renderer (remote/renderer "http://static-viz:3000")]
          (is (= "RENDERED"
                 (js.protocol/chart renderer {:kind "funnel" :data "D" :settings "S" :tokenFeatures "T"})))
          (is (= ["http://static-viz:3000/api/v1/chart"
                  {:kind "funnel" :data "D" :settings "S" :tokenFeatures "T"}]
                 (last @calls)))
          (js.protocol/cell-background-colors renderer {:rows "R" :cols "C" :settings "St" :cells "Ce"})
          (is (= ["http://static-viz:3000/api/v1/cell-background-colors"
                  {:rows "R" :cols "C" :settings "St" :cells "Ce"}]
                 (last @calls))))))))

(deftest trailing-slash-base-url-test
  (testing "a trailing slash on the configured base url doesn't double up with the path's leading slash"
    (let [calls (atom [])]
      (mt/with-dynamic-fn-redefs [http/post (fn [url _] (swap! calls conj url) {:body "OK"})]
        (js.protocol/chart (remote/renderer "http://static-viz:3000/") {:kind "gauge"})
        (is (= "http://static-viz:3000/api/v1/chart" (last @calls)))))))

(deftest retries-transient-errors-test
  (testing "post retries a failing http call and returns once one succeeds"
    (let [calls (atom 0)]
      (binding [retry/*test-time-config-hook*
                (fn [config] (assoc config :max-retries 3 :initial-interval-millis 1 :max-interval-millis 1))]
        (mt/with-dynamic-fn-redefs [http/post (fn [_ _]
                                                (if (< (swap! calls inc) 3)
                                                  (throw (ex-info "boom" {:status 503}))
                                                  {:body "RENDERED"}))]
          (is (= "RENDERED"
                 (js.protocol/chart (remote/renderer "http://static-viz:3000") {:kind "gauge"})))
          (is (= 3 @calls) "failed twice, succeeded on the third attempt"))))))
