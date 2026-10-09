(ns metabase.metabot.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest resolve-dynamic-metabot-id-test
  (testing "metabot ID resolution precedence"
    (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
      (testing "explicit metabot-id takes precedence"
        (is (= "explicit-id"
               (metabot.config/resolve-dynamic-metabot-id "explicit-id"))))
      (testing "falls back to environment variable"
        (mt/with-temporary-setting-values [metabot.settings/metabot-id "env-metabot-id"]
          (is (= "env-metabot-id"
                 (metabot.config/resolve-dynamic-metabot-id nil)))))
      (testing "falls back to internal default when no explicit or env value"
        (is (= metabot.config/internal-metabot-id
               (metabot.config/resolve-dynamic-metabot-id nil)))))))

(deftest resolve-dynamic-profile-id-test
  (testing "profile ID resolution precedence"
    (testing "explicit profile-id takes highest precedence"
      (is (= "explicit-profile"
             (metabot.config/resolve-dynamic-profile-id "explicit-profile" "any-metabot-id"))))
    (testing "metabot-id mapping takes second precedence"
      (is (= "internal"
             (metabot.config/resolve-dynamic-profile-id nil metabot.config/internal-metabot-id)))
      (is (= "embedding_next"
             (metabot.config/resolve-dynamic-profile-id nil metabot.config/embedded-metabot-id))))
    (testing "falls back to default when no matches"
      (is (= "embedding_next"
             (metabot.config/resolve-dynamic-profile-id nil "unknown-metabot-id"))))
    (testing "single arity version uses dynamic metabot resolution"
      (mt/with-temporary-setting-values [metabot.settings/metabot-id metabot.config/embedded-metabot-id]
        (is (= "embedding_next"
               (metabot.config/resolve-dynamic-profile-id nil)))))
    (testing "the retired transforms_codegen profile is rejected whether named as a string or a keyword"
      (doseq [profile-id ["transforms_codegen" :transforms_codegen]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo #"Transform code generation is no longer supported"
             (metabot.config/resolve-dynamic-profile-id profile-id "any-metabot-id")))))))

(deftest check-metabot-enabled-test
  (testing "0-arity throws when both are disabled, passes when either is enabled"
    (mt/with-temporary-setting-values [metabot-enabled? false embedded-metabot-enabled? false]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Metabot is not enabled"
                            (metabot.config/check-metabot-enabled!))))
    (mt/with-temporary-setting-values [metabot-enabled? true embedded-metabot-enabled? false]
      (is (metabot.config/check-metabot-enabled!))))
  (testing "1-arity checks the specific instance's setting"
    (mt/with-temporary-setting-values [metabot-enabled? false embedded-metabot-enabled? true]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Metabot is not enabled"
                            (metabot.config/check-metabot-enabled! {:kind :internal})))
      (is (metabot.config/check-metabot-enabled! {:kind :embedded}))))
  (testing "global AI disable blocks all Metabot instances"
    (mt/with-temporary-raw-setting-values [:ai-features-enabled?      "false"
                                           :metabot-enabled?          "true"
                                           :embedded-metabot-enabled? "true"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled!)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled! {:kind :internal})))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"AI features are not enabled"
                            (metabot.config/check-metabot-enabled! {:kind :embedded}))))))

(deftest integrated-resolution-test
  (testing "combination of metabot-id and profile-id precedence resolution"
    (testing "explicit params override everything"
      (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
        (let [metabot-id (metabot.config/resolve-dynamic-metabot-id "custom-metabot")
              profile-id (metabot.config/resolve-dynamic-profile-id "custom-profile" metabot-id)]
          (is (= "custom-metabot" metabot-id))
          (is (= "custom-profile" profile-id)))))
    (testing "env metabot-id resolves profile via metabot-id mapping"
      (mt/with-temporary-setting-values [metabot.settings/metabot-id metabot.config/embedded-metabot-id]
        (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)
              profile-id (metabot.config/resolve-dynamic-profile-id nil metabot-id)]
          (is (= metabot.config/embedded-metabot-id metabot-id))
          (is (= "embedding_next" profile-id)))))
    (testing "defaults work together"
      (mt/with-temporary-setting-values [metabot.settings/metabot-id nil]
        (let [metabot-id (metabot.config/resolve-dynamic-metabot-id nil)
              profile-id (metabot.config/resolve-dynamic-profile-id nil metabot-id)]
          (is (= metabot.config/internal-metabot-id metabot-id))
          (is (= "internal" profile-id)))))))

(deftest resolve-metabot-kind-test
  (testing "resolve-metabot gives each row the kind of its entity ID"
    (is (= :internal (:kind (metabot.config/resolve-metabot metabot.config/internal-metabot-id))))
    (is (= :embedded (:kind (metabot.config/resolve-metabot metabot.config/embedded-metabot-id))))
    (is (= :embedded (:kind (metabot.config/resolve-metabot "c61bf5f5-1025-47b6-9298-bf1827105bb6"))))
    (mt/with-temp [:model/Metabot {id :id} {:name "imported metabot"}]
      (testing "a row with another entity ID is :custom"
        (is (= :custom (:kind (metabot.config/resolve-metabot id)))))))
  (testing "a resolved Metabot satisfies ::resolved-metabot"
    (is (mr/validate ::metabot.config/resolved-metabot
                     (metabot.config/resolve-metabot metabot.config/internal-metabot-id)))))

(deftest kind-config-requires-resolved-metabot-test
  (testing "a Metabot row that did not come from resolve-metabot has no :kind, so the kind decisions throw"
    (let [row (t2/select-one :model/Metabot :entity_id metabot.config/embedded-metabot-id)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no known :kind"
                            (metabot.config/kind-config row)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no known :kind"
                            (metabot.config/check-metabot-enabled! row))))))

(deftest resolve-metabot-unknown-setting-test
  (testing "an unknown metabot-id setting gives an error that names the setting"
    (mt/with-temporary-setting-values [metabot.settings/metabot-id "nosuchmetabotnosuchmb"]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"MB_METABOT_ID.*nosuchmetabotnosuchmb"
                            (metabot.config/resolve-metabot nil)))))
  (testing "an unknown explicit ID gives the generic error"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"^Unknown Metabot\.$"
                          (metabot.config/resolve-metabot "nosuchmetabotnosuchmb")))))

(deftest enabled-builtin-metabot-ids-test
  (mt/with-temporary-setting-values [metabot-enabled? true embedded-metabot-enabled? false]
    (is (= [metabot.config/internal-metabot-id] (metabot.config/enabled-builtin-metabot-ids))))
  (mt/with-temporary-setting-values [metabot-enabled? true embedded-metabot-enabled? true]
    (is (= [metabot.config/internal-metabot-id metabot.config/embedded-metabot-id]
           (metabot.config/enabled-builtin-metabot-ids)))))
