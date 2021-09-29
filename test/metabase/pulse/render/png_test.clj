(ns metabase.pulse.render.png-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.render.png :as png]
            [metabase.test :as mt]
            [schema.core :as s]))

(deftest register-fonts-test
  (testing "Under normal circumstances, font registration should work as expected"
    (is (= nil
           (#'png/register-fonts-if-needed!))))

  (testing "If font regsitration fails, we should an Exception with a useful error message"
    (with-redefs [png/register-font! (fn [& _]
                                       (throw (ex-info "Oops!" {})))]
      (let [messages (mt/with-log-level :error
                       (mt/with-log-messages
                         (is (thrown-with-msg?
                              clojure.lang.ExceptionInfo
                              #"Error registering fonts: Metabase will not be able to send Pulses"
                              (#'png/register-fonts!)))))]
        (testing "Should log the Exception"
          (is (schema= [(s/one (s/eq :error) "log type")
                        (s/one Throwable "exception")
                        (s/one #"^Error registering fonts" "message")]
                       (first messages))))))))
