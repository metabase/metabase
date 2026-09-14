(ns metabase.app-db.params-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest auto-param-is-lifted-by-the-pipeline-test
  (testing "an inline [:auto/param v] is bound as a SQL parameter with no wrapper at the call site"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "hello" :msgstr "hallo"}
                   :model/ContentTranslation _ {:locale "fr" :msgid "hello" :msgstr "bonjour"}]
      (is (= ["hallo"]
             (map :msgstr
                  (t2/select :model/ContentTranslation
                             {:where [:= :locale [:auto/param "de"]]}))))))
  (testing "a value that looks like SQL is bound, not compiled"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (empty? (t2/select :model/ContentTranslation
                             {:where [:= :locale [:auto/param "de' OR '1'='1"]]})))))
  (testing "several markers in one query each get their own binding"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "x" :msgstr "ex"}
                   :model/ContentTranslation _ {:locale "de" :msgid "y" :msgstr "why"}]
      (is (= ["ex"]
             (map :msgstr
                  (t2/select :model/ContentTranslation
                             {:where [:and
                                      [:= :locale [:auto/param "de"]]
                                      [:= :msgid [:auto/param "x"]]]})))))))

(deftest a-plain-string-is-already-a-literal-test
  (testing "an unmarked string is compared as a literal, so a SQL-looking one matches nothing"
    ;; This is the baseline the marker improves on. A *string* was never the danger -- HoneySQL
    ;; binds it. The danger is a value that is not a string, which HoneySQL compiles as structure.
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (empty? (t2/select :model/ContentTranslation
                             {:where [:= :locale "de' OR '1'='1"]})))
      (is (seq (t2/select :model/ContentTranslation
                          {:where [:= :locale "de"]}))))))

(deftest hostile-non-scalar-never-becomes-sql-test
  (testing "a subquery map in a value slot is refused rather than compiled into the query"
    ;; Handed straight to HoneySQL, a map in a value slot compiles into SQL structure. Through the
    ;; pipeline it is stopped first: `honeysql-guard` refuses the unmarked map at the compile step,
    ;; so the payload never reaches the driver, let alone the database.
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (let [e (try
                (t2/select :model/ContentTranslation
                           {:where [:= :locale [:auto/param {:raw "(SELECT password FROM core_user)"}]]})
                nil
                (catch clojure.lang.ExceptionInfo e e))]
        (is (some? e) "the query is refused")
        (is (not (re-find #"(?i)password" (str (ex-message e))))
            "and the payload never became part of a SQL statement")))))
