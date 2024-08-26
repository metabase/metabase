(ns metabase.config-test
  (:require
   [clojure.test :refer [deftest is testing]])
  (:require-macros
   [metabase.config :as config]))

(deftest ^:parallel build-type-case-test
  (testing "Make sure [[config/build-type-case]] works correctly for ClojureScript."
    (is (= :dev
           (config/build-type-case
            :dev     :dev
            :release :release)))
    (is (= :cljs/dev
           (config/build-type-case
            :clj/dev  :clj/dev
            :cljs/dev :cljs/dev
            :release  :release)))))
