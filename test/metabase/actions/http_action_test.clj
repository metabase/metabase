(ns metabase.actions.http-action-test
  (:require
   [clojure.test :refer :all]
   [metabase.actions.http-action :as actions.http-action]))

(deftest ^:parallel parse-and-substitute-test
  (are [params expected] (= expected
                            (#'actions.http-action/parse-and-substitute "https://example.com/{{param}}[[/{{optional-param}}]]" params))
    {"param" "X"}
    "https://example.com/X"

    {"param" "X", "optional-param" "Y"}
    "https://example.com/X/Y"))

(deftest ^:parallel parse-and-substitute-error-test
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"\QCannot call the service: missing required parameters: param\E"
       (#'actions.http-action/parse-and-substitute "https://example.com/{{param}}[[/{{optional-param}}]]" nil))))
