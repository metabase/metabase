(ns metabase.app-db.empty-in-test
  "A marked empty collection stays inline, so Toucan's empty-`:in` rewrite still applies."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest empty-in-is-rewritten-marked-or-not-test
  (testing "Toucan's rewrite turns IN () into FALSE whether or not the collection is marked"
    ;; Match the clause rather than the whole statement: each app DB quotes identifiers its own way.
    (doseq [v [[] [:auto/param []] [:auto/param #{}]]]
      (testing (pr-str v)
        (let [[sql] (t2/compile (t2/select :model/ContentTranslation {:where [:in :id v]}))]
          (is (re-find #"(?i)WHERE FALSE" sql))
          (is (not (re-find #"IN \(\)" sql))))))))

(deftest marked-empty-in-matches-nothing-test
  (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
    (is (empty? (t2/select :model/ContentTranslation {:where [:in :locale [:auto/param []]]})))
    (is (empty? (t2/select :model/ContentTranslation :locale [:in [:auto/param []]])))))

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
