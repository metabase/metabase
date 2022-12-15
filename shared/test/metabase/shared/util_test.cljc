(ns metabase.shared.util-test
  (:require
    [clojure.test :refer [are deftest is testing]]
    [metabase.shared.util :as shared.u]))

(deftest normalize-key-test
  (are [out in] (= out (shared.u/normalize-key in))
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
       :long-key-goes-here :long-key-goes-here
       ;; namespaced keywords
       :some/key           :some/key
       :some/long-ns-key   :some/long_ns_key
       :some_snake/ns-key  :some_snake/ns_key)) ; Case is not adjusted in the namespace.

(deftest normalize-map-test
  (testing "nil and empty maps return empty maps"
    (is (= {} (shared.u/normalize-map nil)))
    (is (= {} (shared.u/normalize-map {}))))

  (testing "Clojure maps have their keys normalized"
    (are [exp in] (= exp (shared.u/normalize-map in))
         {:some-key 1 :other-key 2} {:some-key 1 :other-key 2}
         {:some-key 1 :other-key 2} {:some_key 1 :other_key 2}
         {:some-key 1 :other-key 2} {"some-key" 1 "other-key" 2}
         {:some-key 1 :other-key 2} {"some_key" 1 "other_key" 2}))

  #?(:cljs
     (testing "JS objects get turned into Clojure maps"
       (are [exp in] (= exp (shared.u/normalize-map in))
            {:some-key 1 :other-key 2} #js {"some-key" 1 "other-key" 2}
            {:some-key 1 :other-key 2} #js {"some_key" 1 "other_key" 2}))))
