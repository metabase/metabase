(ns metabase.content-translation.models-test
  "Tests for content translation models, focusing on the defenterprise function translate-column-display-name."
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.content-translation.dictionary :as content-translation.dictionary]
   [metabase.content-translation.models :as content-translation.models]
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
  (testing "OSS version of get-translations"
    (when-not config/ee-available?
      (testing "returns empty list without premium feature"
        (is (= [] (content-translation.models/get-translations))))

      (testing "returns empty list with locale parameter"
        (is (= [] (content-translation.models/get-translations "en"))))))

  (when config/ee-available?
    (testing "EE version of get-translations"
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
              (let [all-translations (content-translation.models/get-translations)]
                (is (= 3 (count all-translations)))
                (is (every? #(contains? % :locale) all-translations))
                (is (every? #(contains? % :msgid) all-translations))
                (is (every? #(contains? % :msgstr) all-translations))))
            (testing "get-translations with locale parameter filters by locale"
              (let [fr-translations (content-translation.models/get-translations "fr")
                    es-translations (content-translation.models/get-translations "es")]
                (is (= 2 (count fr-translations)))
                (is (= 1 (count es-translations)))
                (is (every? #(= "fr" (:locale %)) fr-translations))
                (is (every? #(= "es" (:locale %)) es-translations))))
            (testing "get-translations with empty locale returns empty collection"
              (let [nonexistent-translations (content-translation.models/get-translations "ja")]
                (is (empty? nonexistent-translations))))
            (testing "get-translations with nil locale behaves same as no parameter"
              (let [all-translations (content-translation.models/get-translations)
                    nil-translations (content-translation.models/get-translations nil)]
                (is (= (count all-translations) (count nil-translations)))
                (is (= (set all-translations) (set nil-translations)))))))))))

(deftest translate-column-display-name-test
  (testing "OSS version of translate-column-display-name"
    (when-not config/ee-available?
      (testing "returns original column metadata unchanged"
        (let [column-metadata {:display_name "Product Category"
                               :name "category"
                               :base_type :type/Text}]
          (is (= column-metadata
                 (content-translation.dictionary/translate-column-display-name column-metadata)))))

      (testing "handles nil display_name"
        (let [column-metadata {:name "category"
                               :base_type :type/Text}]
          (is (= column-metadata
                 (content-translation.dictionary/translate-column-display-name column-metadata)))))

      (testing "handles empty display_name"
        (let [column-metadata {:display_name ""
                               :name "category"
                               :base_type :type/Text}]
          (is (= column-metadata
                 (content-translation.dictionary/translate-column-display-name column-metadata)))))

      (testing "preserves all other column metadata"
        (let [column-metadata {:display_name "Product Category"
                               :name "category"
                               :base_type :type/Text
                               :semantic_type :type/Category
                               :fingerprint {:global {:distinct-count 10}}
                               :source :fields}]
          (is (= column-metadata
                 (content-translation.dictionary/translate-column-display-name column-metadata)))))))

  (when config/ee-available?
    (testing "EE version of translate-column-display-name"
      (mt/with-premium-features #{:content-translation}
        (with-clean-translations!
          (mt/with-temp [:model/ContentTranslation _ {:locale "fr"
                                                      :msgid "Product Category"
                                                      :msgstr "Catégorie de Produit"}
                         :model/ContentTranslation _ {:locale "fr"
                                                      :msgid "Order Total"
                                                      :msgstr "Total de la Commande"}]
            (mt/with-user-locale "fr"
              (testing "translates display_name when translation exists"
                (let [column-metadata {:display_name "Product Category"
                                       :name "category"
                                       :base_type :type/Text}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= "Catégorie de Produit" (:display_name result)))
                  (is (= "category" (:name result)))
                  (is (= :type/Text (:base_type result)))))

              (testing "preserves original display_name when no translation exists"
                (let [column-metadata {:display_name "Untranslated Field"
                                       :name "untranslated"
                                       :base_type :type/Text}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= "Untranslated Field" (:display_name result)))))

              (testing "handles nil display_name gracefully"
                (let [column-metadata {:name "category"
                                       :base_type :type/Text}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= column-metadata result))))

              (testing "handles empty display_name gracefully"
                (let [column-metadata {:display_name ""
                                       :name "category"
                                       :base_type :type/Text}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= "" (:display_name result)))))

              (testing "preserves all other column metadata during translation"
                (let [column-metadata {:display_name "Product Category"
                                       :name "category"
                                       :base_type :type/Text
                                       :semantic_type :type/Category
                                       :fingerprint {:global {:distinct-count 10}}
                                       :source :fields}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= "Catégorie de Produit" (:display_name result)))
                  (is (= :type/Category (:semantic_type result)))
                  (is (= {:global {:distinct-count 10}} (:fingerprint result)))
                  (is (= :fields (:source result))))))

            (mt/with-user-locale "en"
              (testing "no translation occurs for English locale"
                (let [column-metadata {:display_name "Product Category"
                                       :name "category"
                                       :base_type :type/Text}
                      result (content-translation.dictionary/translate-column-display-name column-metadata)]
                  (is (= "Product Category" (:display_name result))))))))))))
