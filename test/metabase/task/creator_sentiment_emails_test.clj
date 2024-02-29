(ns ^:mb/once metabase.task.creator-sentiment-emails-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.email-test :as et :refer [inbox]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task.creator-sentiment-emails :as creator-sentiment-emails]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest send-creator-sentiment-emails!-test
  (mt/with-fake-inbox
    (testing "Make sure we only send emails when surveys-enabled is true"
      (mt/with-temporary-setting-values [surveys-enabled false]
        (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}   ;; mods to 1, this email would be sent if surveys-enabled was true
                                                                       {:email "b@metabase.com"}   ;; mods to 4
                                                                       {:email "c@metabase.com"}]) ;; mods to 2
                      t/month (constantly (t/month 2))]
          (#'creator-sentiment-emails/send-creator-sentiment-emails!)
          (is (= 0
                 (-> @inbox vals first count))))))

    (mt/with-temporary-setting-values [surveys-enabled true]
      (testing "Make sure that send-creator-sentiment-emails! only sends emails to creators with the correct month hash."
        (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}   ;; mods to 1
                                                                       {:email "b@metabase.com"}   ;; mods to 4
                                                                       {:email "c@metabase.com"}]) ;; mods to 2
                      t/month (constantly (t/month 2))]
          (#'creator-sentiment-emails/send-creator-sentiment-emails!)
          (is (= 1
                 (-> @inbox vals first count)))))

      (mt/reset-inbox!)
      (testing "Make sure context is included when anon tracking is enabled"
        (with-redefs [public-settings/anon-tracking-enabled (constantly true)
                      creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}])
                      t/month (constantly (t/month 2))]
          (#'creator-sentiment-emails/send-creator-sentiment-emails!)
          (is (= 1
                 (count (et/regex-email-bodies #"creator\?context=")))))))

    (mt/reset-inbox!)
    (testing "Make sure context isn't included when anon tracking is enabled"
      (with-redefs [public-settings/anon-tracking-enabled (constantly false)
                    creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}])
                    t/month (constantly (t/month 2))]
        (#'creator-sentiment-emails/send-creator-sentiment-emails!)
        (is (= 0
               (count (et/regex-email-bodies #"creator\?context="))))))

    (mt/reset-inbox!)
    (testing "Make sure external services message is included when is self hosted"
      (with-redefs [premium-features/is-hosted? (constantly false)
                    creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}])
                    t/month (constantly (t/month 2))]
        (#'creator-sentiment-emails/send-creator-sentiment-emails!)
        (is (= 1
               (count (et/regex-email-bodies #"external services"))))))))

    (mt/reset-inbox!)
    (testing "Make sure external services isn't included when not self hosted"
        (with-redefs [premium-features/is-hosted? (constantly true)
                      creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}])
                      t/month (constantly (t/month 2))]
          (#'creator-sentiment-emails/send-creator-sentiment-emails!)
          (is (= 0
                 (count (et/regex-email-bodies #"external services"))))))

(deftest fetch-creators-test
  (let [creator-id 33
        creator-email "creator@metabase.com"]
    (t2.with-temp/with-temp [:model/User _ {:email creator-email :id creator-id}
                             :model/User _ {:email "noncreator@metabase.com"}
                             :model/Dashboard _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id :query_type "native"}
                             :model/Card _ {:creator_id creator-id :query_type "native"}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}
                             :model/Card _ {:creator_id creator-id}]
      (testing "Test we only fetch creators with the correct number of questions and dashboards."
        (let [creators (#'creator-sentiment-emails/fetch-creators false)]
          (is (= 1 (count creators)))
          (is (= creator-email (-> creators first :email)))))

      (testing "Whitelabelling only fetches superusers (doesn't fetch anyone)."
        (let [creators (#'creator-sentiment-emails/fetch-creators true)]
          (is (= 0 (count creators))))))))
