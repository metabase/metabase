(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest it-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 204 "/user-key-value" {:key "meow"})
    (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value?key=meow")))
    (is (= "mix" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :value "mix"})))
    (is (= "mix" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow")))
    (is (= "hello" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :value "hello"})))
    (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow")))))
