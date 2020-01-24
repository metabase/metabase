(ns metabase.pulse.render.sparkline-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.pulse.render.sparkline :as sparkline]))

(deftest format-val-fn-test
  "Make sure format-val-fn works correctly for all of the various temporal types"
  (let [f (#'sparkline/format-val-fn "US/Pacific" nil (constantly {:base_type :type/DateTime}))
        t #t "2019-11-20T20:09:55.752-08:00[America/Los_Angeles]"]
    (doseq [t' [(t/instant t)
                (t/local-date t)
                (t/local-time t)
                (t/offset-time t)
                (t/offset-time t)
                (t/local-date-time t)
                (t/offset-date-time t)
                (t/offset-date-time t)
                t]
            x [t' (str t')]]
      (testing (format "^%s %s" (.getName (class x)) x)
        (is (= true
               (boolean (f x))))))))
