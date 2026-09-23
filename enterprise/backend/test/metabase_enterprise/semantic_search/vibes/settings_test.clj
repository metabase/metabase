(ns metabase-enterprise.semantic-search.vibes.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.settings :as vibes.settings]
   [metabase-enterprise.semantic-search.vibes.sqlite :as vibes.sqlite]
   [metabase.test :as mt]))

(deftest defaults-test
  (mt/with-temporary-setting-values [vibes-enabled nil vibes-model nil vibes-rerank-k nil vibes-timeout-ms nil
                                     vibes-api-url nil]
    (is (false? (vibes.settings/vibes-enabled)))
    (is (= "jev-latest" (vibes.settings/vibes-model)))
    (is (= 50 (vibes.settings/vibes-rerank-k)))
    (is (= 2000 (vibes.settings/vibes-timeout-ms)))
    (is (= "https://api.typesafe.ai/v1/systemone" (vibes.settings/vibes-api-url)))))

(deftest env-override-test
  (mt/with-temp-env-var-value! [mb-vibes-enabled "true" mb-vibes-model "jev-2" mb-vibes-rerank-k "10"
                                mb-vibes-timeout-ms "500" mb-vibes-api-key "secret"]
    (is (true? (vibes.settings/vibes-enabled)))
    (is (= "jev-2" (vibes.settings/vibes-model)))
    (is (= 10 (vibes.settings/vibes-rerank-k)))
    (is (= 500 (vibes.settings/vibes-timeout-ms)))
    (is (= "secret" (vibes.settings/vibes-api-key)))))

(deftest disabled-means-null-and-no-calls-test
  (let [calls (atom 0)]
    (vibes.sqlite/reset-cache!)
    (mt/with-temporary-setting-values [vibes-enabled false vibes-api-key "key"]
      (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [& _] (swap! calls inc) {"1" 0.9})]
        (is (nil? (vibes.sqlite/vibes "p" 1 "{\"1\": {\"name\": \"x\"}}")))
        (is (nil? (vibes.sqlite/score-roster "p" "{\"1\": {\"name\": \"x\"}}")))
        (is (zero? @calls))))
    (mt/with-temporary-setting-values [vibes-enabled true vibes-api-key "key"]
      (mt/with-dynamic-fn-redefs [jev/score-candidates! (fn [& _] (swap! calls inc) {"1" 0.9})]
        (is (= 0.9 (vibes.sqlite/vibes "p" 1 "{\"1\": {\"name\": \"x\"}}")))
        (is (= 1 @calls))))))
