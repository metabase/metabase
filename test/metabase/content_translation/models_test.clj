(ns metabase.content-translation.models-test
  "Unit tests for content translation model utilities."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-translation.models :as ct.models]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest content-translation-model-test
  (testing "ContentTranslation model configuration"
    (testing "table-name method returns correct table name"
      (is (= :content_translation (t2/table-name :model/ContentTranslation))))

    (testing "model derives from correct base types"
      (is (isa? :model/ContentTranslation :metabase/model))
      (is (isa? :model/ContentTranslation :hook/labelled?)))))

(deftest get-translations-test
  (mt/with-temp [:model/ContentTranslation translation1 {:locale "tl1" ;; 'tl' means 'test locale'
                                                         :msgid "Hello"
                                                         :msgstr "Hello"}
                 :model/ContentTranslation translation2 {:locale "tl2"
                                                         :msgid "Hello"
                                                         :msgstr "Hola"}
                 :model/ContentTranslation translation3 {:locale "tl1"
                                                         :msgid "Goodbye"
                                                         :msgstr "Goodbye"}]

    (testing "get-translations without locale parameter returns test translations"
      (let [all-translations (ct.models/get-translations)
            test-translations (filter #(#{"tl1" "tl2"} (:locale %)) all-translations)]
        (is (= 3 (count test-translations)))
        (is (every? #(contains? % :locale) test-translations))
        (is (every? #(contains? % :msgid) test-translations))
        (is (every? #(contains? % :msgstr) test-translations))))

    (testing "get-translations with locale parameter filters by locale"
      (let [locale1-translations (ct.models/get-translations "tl1")
            locale2-translations (ct.models/get-translations "tl2")]
        (is (>= (count locale1-translations) 2))
        (is (>= (count locale2-translations) 1))
        (is (every? #(= "tl1" (:locale %)) locale1-translations))
        (is (every? #(= "tl2" (:locale %)) locale2-translations))))

    (testing "get-translations with non-existent locale returns empty collection"
      (let [nonexistent-translations (ct.models/get-translations "xx")]
        (is (empty? nonexistent-translations))))

    (testing "get-translations with nil locale behaves same as no parameter"
      (let [all-translations (ct.models/get-translations)
            nil-translations (ct.models/get-translations nil)]
        (is (= (count all-translations) (count nil-translations)))
        (is (= (set all-translations) (set nil-translations)))))))

(deftest get-translations-edge-cases-test
  (testing "get-translations handles empty strings"
    (mt/with-temp [:model/ContentTranslation translation1 {:locale "tl1"
                                                           :msgid ""
                                                           :msgstr ""}]
      (let [translations (ct.models/get-translations "tl1")]
        (is (>= (count translations) 1))
        (let [empty-translation (first (filter #(= "" (:msgid %)) translations))]
          (is (some? empty-translation))
          (is (= "" (:msgid empty-translation)))
          (is (= "" (:msgstr empty-translation)))))))

  (testing "get-translations handles complex locale codes"
    (mt/with-temp [:model/ContentTranslation translation1 {:locale "tl1"
                                                           :msgid "Complex locale"
                                                           :msgstr "复杂的区域设置"}]
      (let [translations (ct.models/get-translations "tl1")]
        (is (>= (count translations) 1))
        (let [complex-translation (first (filter #(= "Complex locale" (:msgid %)) translations))]
          (is (some? complex-translation))
          (is (= "tl1" (:locale complex-translation))))))))
