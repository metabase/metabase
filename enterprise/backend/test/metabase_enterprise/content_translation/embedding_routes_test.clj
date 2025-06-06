(ns metabase-enterprise.content-translation.embedding-routes-test
  (:require
   [metabase.embedding.api.embed-test :as embed-test]))

(deftest content-translation-embedding-routes-test
  (testing "GET /api/ee/embedded-content-translation/dictionary/:token"
    (embed-test/with-embedding-enabled-and-new-secret-key!
      (ct-utils/with-clean-translations!
        (mt/with-temp [:model/ContentTranslation _ {:locale "fr" :msgid "Hello" :msgstr "Bonjour"}]
          (let [token (card-token card-id)]))))))
;;; Raffi began writing this test but then John wrote a better one
