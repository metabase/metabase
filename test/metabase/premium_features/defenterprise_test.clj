(ns metabase.premium-features.defenterprise-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.test :as mt]))

(defenterprise greeting
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're an OSS customer!" (name username)))

(defenterprise special-greeting
  "Returns a non-special greeting for OSS users, and EE users who don't have the :special-greeting feature token."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're not extra special :(" (name username)))

(defenterprise special-greeting-or-custom
  "Returns a non-special greeting for OSS users."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're not extra special :(" (name username)))

(deftest defenterprise-test
  (when-not config/ee-available?
    (testing "When EE code is not available, a call to a defenterprise function calls the OSS version"
      (is (= "Hi rasta, you're an OSS customer!"
             (greeting :rasta)))))

  (when config/ee-available?
    (testing "When EE code is available"
      (testing "a call to a defenterprise function calls the EE version"
        (is (= "Hi rasta, you're running the Enterprise Edition of Metabase!"
               (greeting :rasta))))

      (testing "if a specific premium feature is required, it will check for it, and fall back to the OSS version by default"
        (mt/with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting :rasta))))

        (mt/with-premium-features #{}
          (is (= "Hi rasta, you're not extra special :("
                 (special-greeting :rasta)))))

      (testing "when :fallback is a function, it is run when the required token is not present"
        (mt/with-premium-features #{:special-greeting}
          (is (= "Hi rasta, you're an extra special EE customer!"
                 (special-greeting-or-custom :rasta))))

        (mt/with-premium-features #{}
          (is (= "Hi rasta, you're an EE customer but not extra special."
                 (special-greeting-or-custom :rasta))))))))

(defenterprise-schema greeting-with-schema :- :string
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the argument was valid" (name username)))

(defenterprise-schema greeting-with-invalid-oss-return-schema :- :keyword
  "Returns a greeting for a user. The OSS implementation has an invalid return schema"
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise-schema greeting-with-invalid-ee-return-schema :- :string
  "Returns a greeting for a user."
  metabase-enterprise.util-test
  [username :- :keyword]
  (format "Hi %s, the return value was valid" (name username)))

(defenterprise greeting-with-only-ee-schema
  "Returns a greeting for a user. Only EE version is defined with defenterprise-schema."
  metabase-enterprise.util-test
  [username]
  (format "Hi %s, you're an OSS customer!" username))

(deftest defenterprise-schema-test
  (when-not config/ee-available?
    (testing "Argument schemas are validated for OSS implementations"
      (is (= "Hi rasta, the argument was valid" (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid input: \[\"should be a keyword, got: \\\"rasta\\\".*"
                            (greeting-with-schema "rasta"))))

    (testing "Return schemas are validated for OSS implementations"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid output: \[\"should be a keyword, got: \\\"Hi rasta.*"
                            (greeting-with-invalid-oss-return-schema :rasta)))))

  (when config/ee-available?
    (testing "Argument schemas are validated for EE implementations"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-schema :rasta)))

      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"Invalid input: \[\"should be a keyword, got: \\\"rasta\\\".*"
                            (greeting-with-schema "rasta"))))
    (testing "Only EE schema is validated if EE implementation is called"
      (is (= "Hi rasta, the schema was valid, and you're running the Enterprise Edition of Metabase!"
             (greeting-with-invalid-oss-return-schema :rasta)))

      (mt/with-premium-features #{:custom-feature}
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid output: \[\"should be a keyword, got: \\\"Hi rasta, the schema was valid.*"
                              (greeting-with-invalid-ee-return-schema :rasta)))))

    (testing "EE schema is not validated if OSS fallback is called"
      (is (= "Hi rasta, the return value was valid"
             (greeting-with-invalid-ee-return-schema :rasta))))))
