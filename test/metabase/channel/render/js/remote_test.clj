(ns metabase.channel.render.js.remote-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.channel.render.js.protocol :as js.protocol]
   [metabase.channel.render.js.remote :as remote]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

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
