(ns metabase.flarg.joke-of-the-day.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.flarg.joke-of-the-day.jokes :as jokes]
   [metabase.test.http-client :as client]))

(defn- joke-set
  "The jokes from jokes.json, with keyword keys so they compare equal to a parsed HTTP response."
  []
  (set (map #(update-keys % keyword) (jokes/jokes))))

(deftest ^:parallel joke-of-the-day-endpoint-test
  (testing "GET /api/joke-of-the-day"
    ;; The expected status of 200 covers both happy-path success and the no-auth
    ;; requirement: [[client/client]] sends no credentials, so a 200 response proves
    ;; the endpoint doesn't sit behind [[metabase.api.routes.common/+auth]].
    (let [response (client/client :get 200 "joke-of-the-day")]
      (testing "response matches the endpoint's schema"
        (is (int? (:id response)))
        (is (string? (:type response)))
        (is (string? (:setup response)))
        (is (string? (:punchline response))))
      (testing "returned joke is one of the jokes in jokes.json"
        (is (contains? (joke-set) response))))))
