(ns metabase.glossary.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.glossary.db :as glossary.db]
   [metabase.test :as mt]))

(deftest glossary-entry-by-term-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "annual recurring revenue"}
                 :model/Glossary _ {:term "MAU" :definition "monthly active users"}]
    (testing "the term is compared as a value"
      (is (= "annual recurring revenue" (:definition (glossary.db/glossary-entry-by-term "ARR")))))
    (testing "a term that looks like SQL matches nothing rather than being compiled"
      (is (nil? (glossary.db/glossary-entry-by-term "ARR' OR '1'='1"))))))

(deftest update-glossary-entry-test
  (mt/with-temp [:model/Glossary {id :id} {:term "ARR" :definition "annual recurring revenue"}]
    (testing "term and definition are written as values"
      (glossary.db/update-glossary-entry! id "MAU" "monthly active users")
      (let [entry (glossary.db/glossary-entry id)]
        (is (= "MAU" (:term entry)))
        (is (= "monthly active users" (:definition entry)))))
    (testing "a definition that looks like SQL is stored as text"
      (let [payload "'); DROP TABLE glossary; --"]
        (glossary.db/update-glossary-entry! id "MAU" payload)
        (is (= payload (:definition (glossary.db/glossary-entry id))))))))

(deftest glossary-entries-search-test
  (mt/with-temp [:model/Glossary _ {:term "ARR" :definition "annual recurring revenue"}
                 :model/Glossary _ {:term "MAU" :definition "monthly active users"}]
    (testing "search matches term or definition case-insensitively"
      (is (= ["ARR"] (map :term (glossary.db/glossary-entries "arr"))))
      (is (= ["MAU"] (map :term (glossary.db/glossary-entries "ACTIVE")))))
    (testing "a wildcard in the search string is matched literally, not as a pattern"
      (is (empty? (glossary.db/glossary-entries "%"))))
    (testing "nil search returns every entry"
      (is (= ["ARR" "MAU"] (map :term (glossary.db/glossary-entries nil)))))))
