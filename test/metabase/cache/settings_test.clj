(ns metabase.cache.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.cache.settings :as cache.settings]
   [metabase.test :as mt]))

(deftest query-caching-max-kb-test
  (testing (str "Make sure Max Cache Entry Size can be set via with a string value, which is what comes back from the "
                "API (#9143)")
    (mt/discard-setting-changes [query-caching-max-kb]
      (is (= "1000"
             (cache.settings/query-caching-max-kb! "1000")))))
  (testing "query-caching-max-kb should throw an error if you try to put in a huge value"
    (mt/discard-setting-changes [query-caching-max-kb]
      (is (thrown-with-msg?
           IllegalArgumentException
           #"Values greater than 204,800 \(200\.0 MB\) are not allowed"
           (cache.settings/query-caching-max-kb! (* 1024 1024)))))))
