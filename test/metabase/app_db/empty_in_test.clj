(ns metabase.app-db.empty-in-test
  "A marked empty collection is refused: whether Toucan's empty-`:in` rewrite applies depends on the
   enclosing operator, which the lift cannot see."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest marked-empty-collection-is-rejected-test
  (are [form] (thrown-with-msg? clojure.lang.ExceptionInfo #"Marked an empty collection"
                                (t2/select :model/ContentTranslation form))
    {:where [:in :id [:auto/param []]]}
    {:where [:= :locale [:auto/param []]]}))

(deftest an-unmarked-empty-in-is-still-rewritten-test
  (testing "leaving it unmarked keeps Toucan's rewrite, which turns IN () into FALSE"
    (is (= ["SELECT * FROM \"CONTENT_TRANSLATION\" WHERE FALSE"]
           (t2/compile (t2/select :model/ContentTranslation {:where [:in :id []]}))))))

(deftest a-non-empty-collection-still-binds-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}
                 :model/ContentTranslation _ {:locale "fr" :msgid "c" :msgstr "d"}]
    (is (= ["de" "fr"]
           (sort (map :locale (t2/select :model/ContentTranslation
                                         {:where [:in :locale [:auto/param ["de" "fr"]]]})))))))

(deftest an-empty-map-is-not-an-empty-collection-test
  (testing "a map is a value rather than a collection of them, so the refusal does not apply"
    ;; `honeysql-guard` rejects a bare map in a value slot before the lift sees it, so assert on
    ;; which guard fires rather than on the query running.
    (let [e (try (t2/select :model/ContentTranslation {:where [:= :locale [:auto/param {}]]})
                 nil
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (some? e))
      (is (not= :metabase.app-db.value-guard/marked-empty-collection (:type (ex-data e)))))))
