(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest it-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :context "cats"})
    (is (= nil (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&context=cats")))
    (is (= "mix" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :context "cats" :value "mix"})))
    (is (= "mix" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&context=cats")))
    (is (= "hello" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :value "hello" :context "cats"})))
    (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&context=cats")))
    (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :context "meow"})
    (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :context "meow" :value {:key1 "foo" :key2 123}})))
    (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&context=meow")))
    (mt/user-http-request :rasta :put 400 "/user-key-value" {:key "meow" :context "meow" :value {}})))
