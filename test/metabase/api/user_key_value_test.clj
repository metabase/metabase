(ns metabase.api.user-key-value-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]
            [toucan2.core :as t2]))

(deftest it-works
  (t2/delete! :model/UserKeyValue :user_id (mt/user->id :rasta))
  (is (= nil (mt/user-http-request :rasta :get 204 "/user-key-value?key=meow")))
  (is (= "mix" (mt/user-http-request :rasta :post 200 "/user-key-value" {:key "meow" :value "mix"})))
  (is (= "mix" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow")))
  (is (= "hello" (mt/user-http-request :rasta :post 200 "/user-key-value" {:key "meow" :value "hello"})))
  (is (= "hello" (mt/user-http-request :rasta :get 200 "/user-key-value?key=meow"))))
