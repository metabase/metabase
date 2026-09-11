(ns metabase.slackbot.client-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.util.http :as u.http]))

(set! *warn-on-reflection* true)

(defn- ok-stream
  "A clj-http 200 response whose body is a small CSV stream."
  []
  {:status 200 :body (io/input-stream (.getBytes "a,b"))})

(deftest download-file-stream-test
  (let [client {:token "xoxb-secret"}]
    (testing "an unsafe or non-Slack URL is refused before any request is made"
      (doseq [url ["http://169.254.169.254/latest/meta-data/"
                   "https://files.slack.com.evil.test/x.csv"
                   "https://evilslack.com/x.csv"
                   "http://files.slack.com/files-pri/T1-F1/data.csv"]]
        (let [called (atom false)]
          (with-redefs [http/get (fn [& _] (reset! called true) (ok-stream))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"non-Slack host"
                                  (slackbot.client/download-file-stream client url)))
            (is (false? @called) (str "no request for " url))))))
    (testing "a Slack URL is fetched with the token, without following redirects, under the network policy"
      (let [opts (atom nil)]
        (with-redefs [http/get (fn [_url options]
                                 (reset! opts options)
                                 (ok-stream))]
          (with-open [stream (slackbot.client/download-file-stream client "https://FILES.slack.com/files-pri/T1-F1/data.csv")]
            (is (= "a,b" (slurp stream))))
          (is (= "Bearer xoxb-secret" (get-in @opts [:headers "Authorization"])))
          (is (= :none (:redirect-strategy @opts)))
          (is (some? (:dns-resolver @opts))))))
    (testing "a non-2xx response throws instead of streaming the body"
      (with-redefs [http/get (fn [_url _options] {:status 302 :body (io/input-stream (.getBytes "<html>"))})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)unexpected response"
                              (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")))))
    (testing "behind a JVM proxy the dns-resolver is omitted, leaving the target to the proxy"
      (let [opts (atom nil)]
        (with-redefs [u.http/jvm-proxied-url? (constantly true)
                      http/get               (fn [_url options]
                                               (reset! opts options)
                                               (ok-stream))]
          (with-open [stream (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")]
            (is (= "a,b" (slurp stream))))
          (is (not (contains? @opts :dns-resolver))))))))
