(ns metabase.jev.client-test
  (:require
   [clojure.test :refer :all]
   [metabase.jev.client :as jev]
   [metabase.test :as mt]))

(deftest key-present-test
  (mt/with-temporary-setting-values [jev-token nil]
    (testing "no token anywhere"
      (mt/with-temporary-setting-values [llm-providers []]
        (is (false? (jev/key-present?)))))
    (testing "a typesafe connection in the provider list supplies the token"
      (mt/with-temporary-setting-values [llm-providers [{:key "openai" :type "openai" :name "OpenAI" :config {:api-key "sk-x"}}
                                                        {:key "typesafe" :type "typesafe" :name "TypeSafe" :config {:api-key "ts-x"}}]]
        (is (true? (jev/key-present?)))))
    (testing "a typesafe connection without a key does not count"
      (mt/with-temporary-setting-values [llm-providers [{:key "typesafe" :type "typesafe" :name "TypeSafe" :config {}}]]
        (is (false? (jev/key-present?)))))
    (testing "the jev-token setting wins"
      (mt/with-temporary-setting-values [jev-token "jt-x" llm-providers []]
        (is (true? (jev/key-present?)))))))
