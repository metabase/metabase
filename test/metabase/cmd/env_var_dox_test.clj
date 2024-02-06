(ns metabase.cmd.env-var-dox-test
  (:require
   [clojure.test :refer :all]
   [metabase.cmd.env-var-dox :as sut]))

(def settings '({:description "Have we sent a follow up email to the instance admin?",
                 :database-local :never,
                 :cache? true,
                 :user-local :never,
                 :default false,
                 :name :follow-up-email-sent,
                 :type :boolean,
                 :enabled? nil,
                 :deprecated nil,
                 :sensitive? false,
                 :tag java.lang.Boolean,
                 :on-change nil,
                 :doc nil,
                 :namespace metabase.task.follow-up-emails,
                 :munged-name "follow-up-email-sent",
                 :visibility :internal}
                {:description "The email address users should be referred to if they encounter a problem.",
                 :database-local :never,
                 :cache? true,
                 :user-local :never,
                 :default nil,
                 :name :admin-email,
                 :type :string,
                 :enabled? nil,
                 :deprecated nil,
                 :sensitive? false,
                 :tag java.lang.String,
                 :on-change nil,
                 :doc nil,
                 :namespace metabase.public-settings,
                 :munged-name "admin-email",
                 :visibility :authenticated}
                {:description
                 "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase. This is a public setting since some analytics events are sent prior to initial setup.",
                 :database-local :never,
                 :cache? true,
                 :user-local :never,
                 :default nil,
                 :name :analytics-uuid,
                 :base metabase.models.setting/uuid-nonce-base,
                 :enabled? nil,
                 :deprecated nil,
                 :sensitive? false,
                 :tag java.lang.String,
                 :on-change nil,
                 :doc false, ;; Because it's false, we should exclude this setting from documentation
                 :namespace metabase.analytics.snowplow,
                 :munged-name "analytics-uuid",
                 :visibility :public}))

(def expected-docs '("### `MB_FOLLOW_UP_EMAIL_SENT`\n\nType: boolean\n\nDefault: `false`\n\nHave we sent a follow up email to the instance admin?"
                     "### `MB_ADMIN_EMAIL`\n\nType: string\n\nDefault: `null`\n\nThe email address users should be referred to if they encounter a problem."))

(deftest test-env-var-docs
  (testing "Environment docs are formatted as expected."
    (let [generated-docs (sut/format-env-var-docs settings)]
      (is (= expected-docs
             generated-docs)))))
