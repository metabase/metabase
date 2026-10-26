(ns metabase-enterprise.data-sensitivity.core-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase-enterprise.data-sensitivity.core :as core]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest unavailable-reason-test
  (mt/with-dynamic-fn-redefs [usage/check-usage-limits! (constantly nil)]
    (testing "Metabot disabled"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled? (constantly false)]
        (is (= :metabot-disabled (core/unavailable-reason)))))
    (testing "no provider configured"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly false)]
        (is (= :no-llm (core/unavailable-reason)))))
    (testing "over the usage limit"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly true)
                                  usage/check-usage-limits!                (constantly "limit")]
        (is (= :usage-limit (core/unavailable-reason)))))
    (testing "available"
      (mt/with-dynamic-fn-redefs [metabot.settings/metabot-enabled?        (constantly true)
                                  metabot.settings/llm-metabot-configured? (constantly true)]
        (is (nil? (core/unavailable-reason)))))))

(deftest sample-connection-error-test
  (testing "a database that connects has no error"
    (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (constantly true)]
      (is (nil? (core/sample-connection-error (mt/db) nil)))))
  (testing "a database that cannot connect returns the connection error"
    (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details?
                                (fn [& _] (throw (ex-info "Timed out after 10.0 s" {})))]
      (is (= "Timed out after 10.0 s" (core/sample-connection-error (mt/db) nil)))))
  (testing "no connection test runs when values are not requested"
    (let [connects (atom 0)]
      (mt/with-dynamic-fn-redefs [driver.u/can-connect-with-details? (fn [& _] (swap! connects inc) true)]
        (is (nil? (core/sample-connection-error (mt/db) {:include-values? false}))))
      (is (= 0 @connects))))
  (testing "an H2 database is allowed to be tested, as sync does"
    (is (nil? (#'core/connection-error (mt/db))))))

(deftest assert-unique-names-test
  (testing "two fields with the same name throw"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"duplicate names: .*email"
                          (core/assert-unique-names! {:id 1} [{:name "email"} {:name "email"} {:name "id"}]))))
  (testing "unique names pass"
    (is (nil? (core/assert-unique-names! {:id 1} [{:name "email"} {:name "id"}])))))

(defn- packet-field [current & {:as overrides}]
  (merge {:id 1 :name "email" :display_name "Email" :description nil :base_type :type/Text :database_type "VARCHAR"
          :semantic_type nil :position 0 :visibility_type :normal :fk_target nil :fingerprint nil :human_set #{}
          :current current :cached_values nil :sample_values nil}
         overrides))

(defn- entry [label & {:as overrides}]
  (merge {:status :labeled :data-sensitivity label :confidence "high" :semantic-type nil :reasoning "because"}
         overrides))

(deftest diff-field-test
  (let [unlabeled {:data_sensitivity nil :human_set false}
        pii       {:data_sensitivity :PII :human_set false}]
    (are [expected current e] (= expected (:status (core/diff-field (packet-field current) e)))
      :new      unlabeled (entry :PII)
      :agree    pii       (entry :PII)
      :disagree pii       (entry :PUBLIC)
      :abstain  pii       (entry nil :status :abstain)
      :dropped  pii       nil)
    (testing "the current state says where the label came from"
      (is (= :unscanned (get-in (core/diff-field (packet-field unlabeled) nil) [:current :state])))
      (is (= :classifier (get-in (core/diff-field (packet-field pii) nil) [:current :state])))
      (is (= :human (get-in (core/diff-field (packet-field {:data_sensitivity :PII :human_set true}) nil)
                            [:current :state]))))
    (testing "a proposed semantic type that differs from the current one is a change"
      (let [result (core/diff-field (packet-field pii) (entry :PII :semantic-type :type/Email))]
        (is (true? (:semantic_changed result)))
        (is (= :type/Email (get-in result [:proposed :semantic_type])))))
    (testing "without a proposed semantic type the current one is kept"
      (let [result (core/diff-field (packet-field pii :semantic_type :type/Email) (entry :PII))]
        (is (false? (:semantic_changed result)))
        (is (= :type/Email (get-in result [:proposed :semantic_type])))))))
