(ns metabase.shared.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.shared.util :as shared.u]))

(deftest normalize-map-test
  (testing "nil and empty maps return empty maps"
    (is (= {} (shared.u/normalize-map nil)))
    (is (= {} (shared.u/normalize-map {}))))

  (let [exp {:kebab-key 1
             :snake-key 2
             :camel-key 3}]
    (testing "Clojure maps have their keys normalized"
      (is (= exp (shared.u/normalize-map {:kebab-key  1 :snake_key  2 :camelKey  3})))
      (is (= exp (shared.u/normalize-map {"kebab-key" 1 "snake_key" 2 "camelKey" 3}))))

    #?(:cljs
       (testing "JS objects get turned into Clojure maps"
         (is (= exp (shared.u/normalize-map #js {"kebab-key" 1 "snake_key" 2 "camelKey" 3})))))))
