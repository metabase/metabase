(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest it-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :namespace "cats"})
    (is (= {:meow nil}
           (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&namespace=cats")))
    (is (= "mix" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :namespace "cats" :value "mix"})))
    (is (= {:meow "mix"} (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&namespace=cats")))
    (is (= "hello" (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :value "hello" :namespace "cats"})))
    (is (= {:meow "hello"} (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&namespace=cats")))
    (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :namespace "meow"})
    (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "meow" :namespace "meow" :value {:key1 "foo" :key2 123}})))
    (is (= {:meow {:key1 "foo" :key2 123}} (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&namespace=meow")))
    (mt/user-http-request :rasta :put 400 "/user-key-value" {:key "meow" :namespace "meow" :value {}})
    (testing "Deletion works"
      (mt/user-http-request :rasta :put 200 "/user-key-value" {:key "other" :namespace "other" :value "true"})
      (is (= {:other "true"} (mt/user-http-request :rasta :get 200 "/user-key-value" {} :key "other" :namespace "other")))
      (mt/user-http-request :rasta :delete 200 "/user-key-value" {:key "other" :namespace "other"})
      (is (= {:other nil}
             (mt/user-http-request :rasta :get 200 "/user-key-value" {} :key "other" :namespace "other"))))))

(deftest expiry-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value" {:namespace "cats"
                                                             :key "meow"
                                                             :value "the-value"
                                                             :expires_at "2014-01-01T00:00:00Z"})
    (is (= {:meow nil} (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow&namespace=cats")))))
