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

(defn- redirect-to
  "A clj-http redirect response pointing at `location`."
  [location]
  {:status 302 :headers {"location" location} :body (io/input-stream (.getBytes ""))})

(deftest download-file-stream-test
  (let [client {:token "xoxb-secret"}]
    (testing "an unsafe, non-Slack or non-file-host URL is refused before any request is made"
      (doseq [url ["http://169.254.169.254/latest/meta-data/"
                   "https://files.slack.com.evil.test/x.csv"
                   "https://evilslack.com/x.csv"
                   "http://files.slack.com/files-pri/T1-F1/data.csv"
                   ;; the rest of slack.com must not receive the token: the response is saved as a model
                   "https://slack.com/api/conversations.list"
                   "https://metaboat.slack.com/files/U1/F1/x.csv"]]
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
    (testing "the CDN file host is accepted too"
      (with-redefs [http/get (fn [_url _options] (ok-stream))]
        (with-open [stream (slackbot.client/download-file-stream client "https://files-origin.slack.com/files-pri/T1-F1/data.csv")]
          (is (= "a,b" (slurp stream))))))
    (testing "a non-2xx response throws instead of streaming the body"
      (with-redefs [http/get (fn [_url _options] {:status 500 :body (io/input-stream (.getBytes "<html>"))})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)unexpected response"
                              (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")))))
    (testing "a redirect to another Slack file host is followed once, with the token reattached"
      (let [calls (atom [])]
        (with-redefs [http/get (fn [url options]
                                 (swap! calls conj [url (get-in options [:headers "Authorization"])])
                                 (if (= url "https://files.slack.com/files-pri/T1-F1/data.csv")
                                   (redirect-to "https://files-origin.slack.com/files-pri/T1-F1/data.csv")
                                   (ok-stream)))]
          (with-open [stream (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")]
            (is (= "a,b" (slurp stream))))
          (is (= ["https://files.slack.com/files-pri/T1-F1/data.csv"
                  "https://files-origin.slack.com/files-pri/T1-F1/data.csv"]
                 (mapv first @calls)))
          (is (every? (fn [[_ auth]] (= "Bearer xoxb-secret" auth)) @calls)))))
    (testing "a redirect off Slack is refused rather than followed"
      (let [calls (atom 0)]
        (with-redefs [http/get (fn [_url _options]
                                 (swap! calls inc)
                                 (redirect-to "https://evil.test/x.csv"))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"non-Slack host"
                                (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")))
          (is (= 1 @calls) "the redirect target is never requested"))))
    (testing "a second redirect is refused instead of followed"
      (let [calls (atom 0)]
        (with-redefs [http/get (fn [_url _options]
                                 (swap! calls inc)
                                 (redirect-to "https://files-origin.slack.com/files-pri/T1-F1/data.csv"))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)unexpected response"
                                (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")))
          (is (= 2 @calls) "one hop only"))))
    (testing "a Location that will not resolve is no redirect, and the response body is still closed"
      (let [calls  (atom 0)
            closed (atom false)]
        (with-redefs [http/get (fn [_url _options]
                                 (swap! calls inc)
                                 {:status  302
                                  :headers {"location" "http://[not a uri"}
                                  :body    (proxy [java.io.ByteArrayInputStream] [(.getBytes "")]
                                             (close []
                                               (reset! closed true)))})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)unexpected response"
                                (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")))
          (is (= 1 @calls) "the malformed target is never requested")
          (is (true? @closed) "the response stream is closed"))))
    (testing "behind a JVM proxy the dns-resolver is omitted, leaving the target to the proxy"
      (let [opts (atom nil)]
        (with-redefs [u.http/jvm-proxied-url? (constantly true)
                      http/get               (fn [_url options]
                                               (reset! opts options)
                                               (ok-stream))]
          (with-open [stream (slackbot.client/download-file-stream client "https://files.slack.com/files-pri/T1-F1/data.csv")]
            (is (= "a,b" (slurp stream))))
          (is (not (contains? @opts :dns-resolver))))))))
