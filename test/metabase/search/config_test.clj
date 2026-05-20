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
  (testing "Legacy search should respect context overrides (#UXW-3238)"
    (is (= "exclude-others"
           (search.config/filter-default :search.engine/in-place :command-palette :filter-items-in-personal-collection)))
    (is (= "exclude-others"
           (search.config/filter-default :search.engine/in-place :search-app :filter-items-in-personal-collection)))))

(deftest metabot-weights-test
  (testing "the :metabot context defines the tuned curation tier weights"
    (is (=? {:library             100
             :official-collection 80
             :verified            80
             :data-layer          1
             :data-layer/final    33
             :data-layer/internal 10
             :data-layer/hidden   1}
            (search.config/weights {:context :metabot}))))
  (testing "request-level :weights override beats :metabot static weights"
    (is (= 7 (-> (search.config/weights {:context :metabot :weights {:library 7}})
                 :library)))))
