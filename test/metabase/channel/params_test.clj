(ns metabase.channel.params-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.params :as channel.params]))

(deftest substitute-params-test
  (are [expected text context]
    (= expected (channel.params/substitute-params text context))

    "Hello ngoc@metabase.com!" "Hello {{email}}!" {:email "ngoc@metabase.com"}
    ;; nested access
    "Hello ngoc@metabase.com!" "Hello {{user.email}}!" {:user {:email "ngoc@metabase.com"}})

  (testing "throw an error if missing params"
    (is (thrown? Exception (channel.params/substitute-params "Hello {{email}}!" {}))))

  (testing "Do not throw an error if missing params and ignore-missing? is true"
    (is (= "Hello !" (channel.params/substitute-params "Hello {{email}}!" {} true)))))
