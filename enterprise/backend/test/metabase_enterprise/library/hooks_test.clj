(ns metabase-enterprise.library.hooks-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.library.hooks :as library.hooks]
   [metabase.test :as mt]))

(deftest after-startup-test
  (mt/with-discard-model-updates! [:model/Collection]
    (without-library
     (testing "does nothing without the library feature"
       (mt/with-premium-features #{}
         (library.hooks/after-startup)
         (is (nil? (collection/library-collection)))))
     (testing "creates the Library with the library feature"
       (mt/with-premium-features #{:library}
         (library.hooks/after-startup)
         (is (some? (collection/library-collection)))))
     (testing "keeps an existing Library"
       (mt/with-premium-features #{:library}
         (let [library-id (:id (collection/library-collection))]
           (library.hooks/after-startup)
           (is (= library-id (:id (collection/library-collection))))))))))

(deftest after-premium-token-update-test
  (mt/with-discard-model-updates! [:model/Collection]
    (without-library
     (testing "does nothing without the library feature"
       (mt/with-premium-features #{}
         (library.hooks/after-premium-token-update)
         (is (nil? (collection/library-collection)))))
     (testing "creates the Library once the token gains the library feature"
       (mt/with-premium-features #{:library}
         (library.hooks/after-premium-token-update)
         (is (some? (collection/library-collection))))))))
