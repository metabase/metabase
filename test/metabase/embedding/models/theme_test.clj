(ns metabase.embedding.models.theme-test
  (:require
   [clojure.test :refer :all]
   [metabase.embedding.models.theme :as embedding-theme]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/EmbeddingTheme]
    (let [rows (fn [n] (mapv (fn [i] (cond-> {:name (mt/random-name) :settings {}}
                                       (odd? i) (assoc :is_default false)))
                             (range n)))]
      (testing "creating themes"
        (embedding-theme/create-embedding-themes! (rows 1))
        (is (= (events.tu/statement-count! #(embedding-theme/create-embedding-themes! (rows 2)))
               (events.tu/statement-count! #(embedding-theme/create-embedding-themes! (rows 6))))))
      (testing "creating themes returns the inserted rows in the order of the given ones"
        (let [given   [{:name "First" :settings {}} {:name "Second" :settings {} :is_default false} {:name "Third" :settings {}}]
              created (embedding-theme/create-embedding-themes! given)]
          (is (= ["First" "Second" "Third"] (map :name created)))))
      (testing "updating and deleting themes by id"
        (let [ids (mapv :id (embedding-theme/create-embedding-themes! (rows 2)))]
          (embedding-theme/update-embedding-themes! ids {:name "Renamed"})
          (is (= ["Renamed" "Renamed"] (mapv #(t2/select-one-fn :name :model/EmbeddingTheme :id %) ids)))
          (embedding-theme/delete-embedding-themes! ids)
          (is (zero? (t2/count :model/EmbeddingTheme :id [:in ids]))))))))
