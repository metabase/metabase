(ns metabase.metabot.search-models-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.metabot.search-models :as sm]
   [metabase.search.spec :as search.spec]))

(deftest ^:parallel mappings-stay-in-sync-with-search-spec-test
  (let [mappings      @#'sm/entity->search
        metabot-names (set (keys mappings))
        search-models (set search.spec/search-models)]
    (testing "translated values are valid search-model names"
      (is (set/subset? (set (vals mappings)) search-models)))
    (testing "metabot aliases don't collide with search-model names"
      (is (empty? (set/intersection metabot-names search-models))))
    (testing "every mapping round-trips — implies injectivity and a correct inverse"
      (doseq [k metabot-names]
        (is (= k (-> k sm/entity-type->search-model sm/search-model->entity-type)))))))
