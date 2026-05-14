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
  (testing "the :metabot context returns the tuned curation tier weights"
    (let [w (search.config/weights {:context :metabot})]
      (is (= 100 (:library w)))
      (is (= 80  (:official-collection w)))
      (is (= 80  (:verified w)))
      (is (= 33  (:final w)))
      (is (= 10  (:internal w)))
      (is (= 1   (:hidden w)))))
  (testing "the :metabot context still inherits :default scorers it doesn't override"
    (let [defaults (search.config/weights {:context :default})
          metabot  (search.config/weights {:context :metabot})]
      (doseq [k [:text :exact :rrf :model :view-count :recency]]
        (is (= (get defaults k) (get metabot k))
            (str "Inherited " k " from :default")))))
  (testing "request-level :weights override beats :metabot static weights"
    (is (= 7 (-> (search.config/weights {:context :metabot :weights {:library 7}})
                 :library)))))
