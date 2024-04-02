(ns ^:mb/once metabase.task.creator-sentiment-emails-test
  (:require
   [buddy.core.codecs :as codecs]
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.email-test :as et :refer [inbox]]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task.creator-sentiment-emails :as creator-sentiment-emails]
   [metabase.test :as mt]
   [metabase.util.malli.schema :as ms]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest send-creator-sentiment-emails!-test
  (mt/with-fake-inbox
    (testing "Make sure we only send emails when surveys-enabled is true"
      (doseq [enabled? [true false]]
        (mt/reset-inbox!)
        (mt/with-temporary-setting-values [surveys-enabled enabled?]
          (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"} ;; mods to 45, this email would be sent if surveys-enabled was true
                                                                         {:email "b@metabase.com"} ;; mods to 4
                                                                         {:email "c@metabase.com"}]) ;; mods to 26
                        ]
            (#'creator-sentiment-emails/send-creator-sentiment-emails! 45)
            (is (= (if enabled? 1 0)
                   (-> @inbox vals first count))
                (str "error when enabled? is " enabled?))))))

    (mt/with-temporary-setting-values [surveys-enabled true]
      (testing "Make sure that send-creator-sentiment-emails! only sends emails to creators with the correct week hash."
        (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}   ;; mods to 45
                                                                       {:email "b@metabase.com"}   ;; mods to 4
                                                                       {:email "c@metabase.com"}]) ;; mods to 26
                      ]
          (#'creator-sentiment-emails/send-creator-sentiment-emails! 45)
          (is (= 1
                 (-> @inbox vals first count))))))

    (testing "Make sure context is included when anon tracking is enabled"
      (doseq [tracking-enabled? [true false]]
        (mt/reset-inbox!)
        (mt/with-temporary-setting-values [anon-tracking-enabled tracking-enabled?]
          (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email          "a@metabase.com"
                                                                          :created_at     (t/local-date-time)
                                                                          :num_dashboards 4
                                                                          :num_questions  7
                                                                          :num_models     2}])]
            (#'creator-sentiment-emails/send-creator-sentiment-emails! 45)
            (is (= (if tracking-enabled? 1 0)
                   (count (et/regex-email-bodies #"creator\?context="))))
            (when tracking-enabled?
              (let [email-body (-> @inbox vals first first :body first :content)]
                (is (string? email-body))
                (let [[_ query-params] (re-find #"creator\?context=(.*)\"" email-body)
                      decoded          (some-> query-params codecs/b64->str json/parse-string )]
                  (is (=? {"instance" {"created_at"     (mt/malli=? ms/TemporalString)
                                       "plan"           (mt/malli=? :string)
                                       "version"        (mt/malli=? :string)
                                       "num_users"      (mt/malli=? :int)
                                       "num_dashboards" (mt/malli=? :int)
                                       "num_databases"  (mt/malli=? :int)
                                       "num_questions"  (mt/malli=? :int)
                                       "num_models"     (mt/malli=? :int)}
                           "user"     {"created_at"     (mt/malli=? ms/TemporalString)
                                       "num_dashboards" 4
                                       "num_questions"  7
                                       "num_models"     2}}
                          decoded)))))))))
    (testing "Make sure external services message is included when is self hosted"
      (doseq [hosted? [true false]]
        (mt/reset-inbox!)
        (with-redefs [creator-sentiment-emails/fetch-creators (fn [_] [{:email "a@metabase.com"}])
                      ;; can't use mt/with-temporary-setting-values because of a custom :getter
                      premium-features/is-hosted?             (constantly hosted?)]
          (#'creator-sentiment-emails/send-creator-sentiment-emails! 45)
          (is (= (if hosted? 0 1)
                 (count (et/regex-email-bodies #"external services")))))))))

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
