(ns metabase.shared.util-test
  (:require
    [clojure.test :refer [are deftest is testing]]
    [metabase.shared.util :as su]))

(deftest normalize-key-test
  (are [out in] (= out (su/normalize-key in))
       ;; snake_case strings
       :key                "key"
       :Key                "Key"
       :KEY                "KEY"
       :some-key           "some_key"
       :long-key-goes-here "long_key_goes_here"
       ;; :snake_case keywords
       :key                :key
       :Key                :Key
       :KEY                :KEY
       :some-key           :some_key
       :long-key-goes-here :long_key_goes_here
       ;; kebab-case strings
       :key                "key"
       :Key                "Key"
       :KEY                "KEY"
       :some-key           "some-key"
       :long-key-goes-here "long-key-goes-here"
       ;; :kebab-case keywords
       :key                :key
       :Key                :Key
       :KEY                :KEY
       :some-key           :some-key
       :long-key-goes-here :long-key-goes-here)

  (testing "it drops namespaces off input keywords"
    (is (= :base-name (su/normalize-key :some.namespace/base-name)))))

(deftest normalize-map-test
  (testing "nil and empty maps return empty maps"
    (is (= {} (su/normalize-map nil)))
    (is (= {} (su/normalize-map {}))))

  (testing "Clojure maps have their keys normalized"
    (are [exp in] (= exp (su/normalize-map in))
         {:some-key 1 :other-key 2} {:some-key 1 :other-key 2}
         {:some-key 1 :other-key 2} {:some_key 1 :other_key 2}
         {:some-key 1 :other-key 2} {"some-key" 1 "other-key" 2}
         {:some-key 1 :other-key 2} {"some_key" 1 "other_key" 2}))

  #?(:cljs
     (testing "JS objects get turned into Clojure maps"
       (are [exp in] (= exp (su/normalize-map in))
            {:some-key 1 :other-key 2} #js {"some-key" 1 "other-key" 2}
            {:some-key 1 :other-key 2} #js {"some_key" 1 "other_key" 2}))))
