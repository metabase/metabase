(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest it-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (testing "Can clear values by setting them to nil"
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value nil})
      (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/cats/key/meow")))
      (mt/user-http-request :crowberto :put 200 "/user-key-value/namespace/cats/key/meow" {:value nil})
      (is (= nil (mt/user-http-request :crowberto :get 204 "/user-key-value/namespace/cats/key/meow"))))

    (testing "Can set and reset user-local key-value pairs"
      ;; Set one KV pair for Rasta
      (is (= "mix" (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "mix"})))
      (is (= "mix" (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/cats/key/meow")))

      ;; Update KV pair for rasta
      (is (= "hello" (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "hello"})))
      (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/cats/key/meow")))

      ;; Set KV pair for Crowberto using the same key
      (is (= nil (mt/user-http-request :crowberto :get 204 "/user-key-value/namespace/cats/key/meow")))
      (is (= "dog" (mt/user-http-request :crowberto :put 200 "/user-key-value/namespace/cats/key/meow" {:value "dog"})))
      (is (= "dog" (mt/user-http-request :crowberto :get 200 "/user-key-value/namespace/cats/key/meow")))

      ;; Rasta's value doesn't change
      (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/cats/key/meow"))))

    (testing "Values are validated against Malli schemas on write, and transformed based on the schemas on read"
      (mt/user-http-request :rasta :put 400 "/user-key-value/namespace/meow/key/meow" {:value {}})
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/meow/key/meow" {})

      (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/meow/key/meow" {:value {:key1 "foo" :key2 123}})))
      (is (= {:key1 "foo" :key2 123} (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/meow/key/meow"))))

    (testing "Malli schema can specify default values"
      ;; See https://github.com/metosin/malli#default-values for more details on default values
      (is (= {:key1 "default" :key2 123} (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/meow/key/meow" {:value {:key2 123}})))
      (is (= {:key1 "default" :key2 123} (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/meow/key/meow"))))

    (testing "Deletion works"
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/other" {:value "true"})
      (is (= true (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/other/key/other")))
      (mt/user-http-request :rasta :delete 200 "/user-key-value/namespace/other/key/other")
      (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/other/key/other"))))))

(deftest expiry-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/cats/key/meow" {:value "the-value"
                                                                                     :expires_at "2014-01-01T00:00:00Z"})
    (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value/namespace/cats/key/meow")))))

(deftest multi-retrieve-works
  (mt/with-model-cleanup [:model/UserKeyValue]
    (testing "All KV pairs set in a namespace can be fetched at once"
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/a" {:value "a value"})
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/b" {:value "b value"})
      (mt/user-http-request :rasta :put 200 "/user-key-value/namespace/other/key/c" {:value "c value"})
      (is (= {:a "a value"
              :b "b value"
              :c "c value"}
             (mt/user-http-request :rasta :get 200 "/user-key-value/namespace/other"))))))
