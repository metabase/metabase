(ns metabase.slackbot.client-test
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase.slackbot.client :as slackbot.client]))

(set! *warn-on-reflection* true)

(deftest download-file-stream-test
  (let [client {:token "xoxb-secret"}]
    (testing "a URL outside slack.com is refused before any request is made"
      (doseq [url ["http://169.254.169.254/latest/meta-data/"
                   "https://files.slack.com.evil.test/x.csv"
                   "https://evilslack.com/x.csv"]]
        (let [called (atom false)]
          (with-redefs [http/get (fn [& _] (reset! called true) {:body (io/input-stream (.getBytes "a,b"))})]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"non-Slack host"
                                  (slackbot.client/download-file-stream client url)))
            (is (false? @called) (str "no request for " url))))))

    (testing "a Slack URL is fetched with the token, without following redirects, under the network policy"
      (let [opts (atom nil)]
        (with-redefs [http/get (fn [_url options]
                                 (reset! opts options)
                                 {:body (io/input-stream (.getBytes "a,b"))})]
          (with-open [stream (slackbot.client/download-file-stream client "https://FILES.slack.com/files-pri/T1-F1/data.csv")]
            (is (= "a,b" (slurp stream))))
          (is (= "Bearer xoxb-secret" (get-in @opts [:headers "Authorization"])))
          (is (= :none (:redirect-strategy @opts)))
          (is (some? (:dns-resolver @opts))))))))
