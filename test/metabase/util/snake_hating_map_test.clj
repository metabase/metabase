(ns metabase.util.snake-hating-map-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.snake-hating-map :as u.snake-hating-map]))

(deftest ^:parallel create-test
  (is (= (u.snake-hating-map/snake-hating-map {:a 1, :b 2})
         (u.snake-hating-map/snake-hating-map :a 1, :b 2))))
