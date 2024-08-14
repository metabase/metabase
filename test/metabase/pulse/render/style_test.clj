(ns metabase.pulse.render.style-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.render.style :as style]
   [metabase.test :as mt]))

(deftest ^:parallel filter-out-nil-test
  (testing "`style` should filter out nil values"
    (is (= ""
           (style/style {:a nil})))

    (is (= "a: 0; c: 2;"
           (style/style {:a 0, :b nil, :c 2, :d ""})))))

(deftest register-fonts-test
  (testing "Under normal circumstances, font registration should work as expected"
    (is (= nil
           (#'style/register-fonts-if-needed!))))

  (testing "If font registration fails, we should an Exception with a useful error message"
    (with-redefs [style/register-font! (fn [& _]
                                         (throw (ex-info "Oops!" {})))]
      (let [messages (mt/with-log-messages-for-level :error
                       (is (thrown-with-msg?
                            clojure.lang.ExceptionInfo
                            #"Error registering fonts: Metabase will not be able to send Pulses"
                            (#'style/register-fonts!))))]
        (testing "Should log the Exception"
          (is (=? [:error Throwable #"^Error registering fonts: .*"]
                  (first messages))))))))
