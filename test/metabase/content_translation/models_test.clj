(ns metabase.content-translation.models-test
  "Unit tests for content translation model utilities."
  (:require
   [clojure.test :refer :all]
   [metabase.content-translation.dictionary :as ct.dict]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro with-clean-translations!
  "Macro to reset the content translation table to an empty state before a test and restore it after the test runs."
  [& body]
  `(let [original-entities# (t2/select [:model/ContentTranslation])]
     (try
       (t2/delete! :model/ContentTranslation)
       ~@body
       (finally
         (t2/delete! :model/ContentTranslation)
         (when (seq original-entities#)
           (t2/insert! :model/ContentTranslation original-entities#))))))

(deftest get-translations-test
  (mt/with-premium-features #{:content-translation}
    (with-clean-translations!
      (mt/with-temp [:model/ContentTranslation _ {:locale "fr"
                                                  :msgid "Hello"
                                                  :msgstr "Bonjour"}
                     :model/ContentTranslation _ {:locale "es"
                                                  :msgid "Hello"
                                                  :msgstr "Hola"}
                     :model/ContentTranslation _ {:locale "fr"
                                                  :msgid "Goodbye"
                                                  :msgstr "Au revoir"}]
        (testing "get-translations without locale parameter returns all translations"
          (let [all-translations (t2/select :model/ContentTranslation)]
            (is (= 3 (count all-translations)))
            (is (every? #(contains? % :locale) all-translations))
            (is (every? #(contains? % :msgid) all-translations))
            (is (every? #(contains? % :msgstr) all-translations))))
        (testing "get-translations with locale parameter filters by locale"
          (let [fr-translations (ct.dict/get-translations "fr")
                es-translations (ct.dict/get-translations "es")]
            (is (= 2 (count fr-translations)))
            (is (= 1 (count es-translations)))
            (is (every? #(= "fr" (:locale %)) fr-translations))
            (is (every? #(= "es" (:locale %)) es-translations))))
        (testing "get-translations with empty locale returns empty collection"
          (let [nonexistent-translations (ct.dict/get-translations "ja")]
            (is (empty? nonexistent-translations))))
        (testing "get-translations with nil locale behaves same as no parameter"
          (let [all-translations (ct.dict/get-translations)
                nil-translations (ct.dict/get-translations nil)]
            (is (= (count all-translations) (count nil-translations)))
            (is (= (set all-translations) (set nil-translations)))))))))
