(ns metabase.content-translation.models-test
  "Unit tests for content translation model utilities."
  (:require
   [clojure.test :refer :all]
   [metabase.content-translation.models :as ct.models]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest get-translations-test
  (mt/with-premium-features #{:content-translation}
    (mt/with-empty-h2-app-db
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
          (let [fr-translations (ct.models/get-translations "fr")
                es-translations (ct.models/get-translations "es")]
            (is (= 2 (count fr-translations)))
            (is (= 1 (count es-translations)))
            (is (every? #(= "fr" (:locale %)) fr-translations))
            (is (every? #(= "es" (:locale %)) es-translations))))

        (testing "get-translations with empty locale returns empty collection"
          (let [nonexistent-translations (ct.models/get-translations "ja")]
            (is (empty? nonexistent-translations))))

        (testing "get-translations with nil locale behaves same as no parameter"
          (let [all-translations (ct.models/get-translations)
                nil-translations (ct.models/get-translations nil)]
            (is (= (count all-translations) (count nil-translations)))
            (is (= (set all-translations) (set nil-translations)))))))

    (testing "get-translations handles complex unicode"
      (mt/with-temp [:model/ContentTranslation _ {:locale "zh_CN"
                                                  :msgid "Eat while it's hot"
                                                  :msgstr "趁热吃"}]
        (let [translations (ct.models/get-translations "zh_CN")]
          (is (= 1 (count translations)))
          (let [translation (first translations)]
            (is (= "zh_CN" (:locale translation)))
            (is (= "Eat while it's hot" (:msgid translation)))
            (is (= "趁热吃" (:msgstr translation)))))))))
