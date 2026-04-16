(ns metabase.metabot.search-models-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.metabot.search-models :as metabot.search-models]
   [metabase.search.spec :as search.spec]))

(deftest ^:parallel mappings-stay-in-sync-with-search-spec-test
  (testing "every translated value in search-model-mappings must be a valid search-engine model"
    (let [translations  (set (vals metabot.search-models/search-model-mappings))
          search-models (set search.spec/search-models)]
      (is (empty? (set/difference translations search-models))
          (str "search-model-mappings translates to values not present in search.spec/search-models."
               " Either update the mapping or add the new search model to search.spec.")))))
