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
  ;; Derive expectations from static-weights so retuning the magnitudes doesn't churn this test;
  ;; what we're pinning is the inheritance contract, not the specific numbers.
  (let [default (:default search.config/static-weights)]
    (testing ":metabot has no static overrides — it inherits :default verbatim"
      (is (=? default
              (search.config/weights {:context :metabot}))))
    (testing "request-level :weights override beats static weights"
      (is (= 7 (-> (search.config/weights {:context :metabot :weights {:library 7}})
                   :library))))))
