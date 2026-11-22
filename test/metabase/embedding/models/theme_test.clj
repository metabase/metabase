(ns metabase.embedding.models.theme-test
  (:require
   [clojure.test :refer :all]
   [metabase.embedding.models.theme :as embedding-theme]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/EmbeddingTheme]
    (let [rows (fn [n] (mapv (fn [i] (cond-> {:name (mt/random-name) :settings {}}
                                       (odd? i) (assoc :is_default false)))
                             (range n)))]
      (testing "creating themes"
        (embedding-theme/create-embedding-themes! (rows 1))
        (is (= (events.tu/statement-count! #(embedding-theme/create-embedding-themes! (rows 2)))
               (events.tu/statement-count! #(embedding-theme/create-embedding-themes! (rows 6)))))))))
