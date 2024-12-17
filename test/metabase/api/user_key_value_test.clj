(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest it-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow")
    (is (= nil
           (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/cats/key/meow" {})))
    (is (= "mix" (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "mix"})))
    (is (= "mix" (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/cats/key/meow")))
    (is (= "hello" (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "hello"})))
    (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/cats/key/meow")))
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/meow/key/meow" {})
    (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/meow/key/meow" {:value {:key1 "foo" :key2 123}})))
    (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/meow/key/meow")))
    (mt/user-http-request :rasta :put 400 "/user-key-value/namespace/meow/key/meow" {:value {}})
    (testing "Deletion works"
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/other" {:value "true"})
      (is (= true (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/other/key/other")))
      (mt/user-http-request :rasta :delete 200 "/user-key-value/namespace/other/key/other")
      (is (= nil
             (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/other/key/other"))))))

(deftest expiry-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "the-value"
                                                                                     :expires_at "2014-01-01T00:00:00Z"})
    (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/cats/key/meow")))))

(deftest multi-retrieve-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/a" {:value "a"})
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/b" {:value "b"})
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/c" {:value "c"})
    (is (= {:a "a"
            :b "b"
            :c "c"}
           (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/other?a=123&keyyy=1234&keyyy=24564&keyyy=1234")))))
