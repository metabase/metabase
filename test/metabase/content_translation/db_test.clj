(ns metabase.content-translation.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-translation.db :as content-translation.db]
   [metabase.test :as mt]))

(deftest translations-for-locale-test
  (testing "filters to the requested locale"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                   :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
      (is (= ["hallo"] (map :msgstr (content-translation.db/translations-for-locale "de"))))))
  (testing "a locale that looks like SQL is compared as a string, matching nothing"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}]
      (is (empty? (content-translation.db/translations-for-locale "de' OR '1'='1")))))
  (testing "a non-string locale is rejected before it reaches the query"
    (is (thrown? clojure.lang.ExceptionInfo
                 (content-translation.db/translations-for-locale {:raw "(SELECT 1)"})))))

(deftest insert-translations-partitions-rows-test
  (testing "insert-translations! inserts every row and returns their number when the rows span several partitions"
    (mt/with-model-cleanup [:model/ContentTranslation]
      (mt/with-partition-size 2
        (let [rows (mapv (fn [i] {:locale "de" :msgid (str "partitioned " i) :msgstr (str "aufgeteilt " i)}) (range 5))]
          (is (= 5 (content-translation.db/insert-translations! rows)))
          (is (= (set (map :msgid rows))
                 (into #{}
                       (comp (map :msgid) (filter #(re-find #"^partitioned " %)))
                       (content-translation.db/translations-for-locale "de")))))))))
