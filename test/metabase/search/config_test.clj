(ns metabase.search.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.config :as search.config]))

;; All that matters is that this is not legacy search.
(def ^:private search-engine :search.engine/appdb)

(deftest filter-default-test
  (testing "Default values"
    (is (= false (search.config/filter-default search-engine nil :archived)))
    (is (= "all" (search.config/filter-default search-engine nil :filter-items-in-personal-collection))))
  (testing "No overrides"
    (is (= false (search.config/filter-default search-engine :command-palette :archived))))
  (testing "Overrides"
    (is (= "exclude-others"
           (search.config/filter-default search-engine :command-palette :filter-items-in-personal-collection)))
    (is (= "exclude-others"
           (search.config/filter-default search-engine :search-app :filter-items-in-personal-collection))))
  (testing "Legacy search does not support overrides"
    (is (= "all"
           (search.config/filter-default :search.engine/in-place :command-palette :filter-items-in-personal-collection)))))
