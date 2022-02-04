(ns metabase.pulse.render.png-test
  (:require [clojure.test :refer :all]
            [metabase.pulse.render.png :as png]
            [metabase.test :as mt]
            [schema.core :as s]))

(deftest register-fonts-test
  (testing "Under normal circumstances, font registration should work as expected"
    (is (= nil
           (#'png/register-fonts-if-needed!))))

  (testing "If font registration fails, we should an Exception with a useful error message"
    (with-redefs [png/register-font! (fn [& _]
                                       (throw (ex-info "Oops!" {})))]
      (let [messages (mt/with-log-messages-for-level :error
                       (is (thrown-with-msg?
                            clojure.lang.ExceptionInfo
                            #"Error registering fonts: Metabase will not be able to send Pulses"
                            (#'png/register-fonts!))))]
        (testing "Should log the Exception"
          (is (schema= [(s/one (s/eq :error) "log type")
                        (s/one Throwable "exception")
                        (s/one #"^Error registering fonts" "message")]
                       (first messages))))))))

(def ^:private test-table-html
  "<table><tr><th>Column 1</th><th>Column 2</th></tr><tr><td>Data</td><td>Data</td></tr></table>")

(deftest table-width-test
  (testing "The PNG of a table should be cropped to the width of its content"
    (let [png (@#'png/render-to-png test-table-html 1200)]
      ;; Check that width is within a range, since actual rendered result can very slightly by environment
      (is (< 170 (.getWidth png) 210)))))
