(ns metabase.content-translation.enforcement-test
  "Proves the value check is scoped to the namespaces that adopted it: it fires for a query issued
   from an enforcing namespace, and stays out of the way everywhere else."
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.value-guard :as value-guard]
   [metabase.content-translation.db :as content-translation.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- value-guard-rejected?
  [thunk]
  (try
    (thunk)
    false
    (catch clojure.lang.ExceptionInfo e
      (= ::value-guard/unwrapped-value (:type (ex-data e))))))

;; A bare keyword in a value slot is the discriminator: `honeysql-guard` permits it, the value
;; guard does not. So whichever guard fires tells us whether this namespace is enforcing.
(def ^:private hostile {:where [:= :locale :not-a-value]})

(deftest fires-for-an-enforcing-namespace-test
  (testing "a query issued from an adopted namespace is checked"
    (is (contains? value-guard/enforcing-namespace-prefixes "metabase.content-translation.db"))
    (is (value-guard-rejected?
         #(#'content-translation.db/unchecked-value-query-for-tests)))))

(deftest does-not-fire-for-other-namespaces-test
  (testing "the same query issued from a namespace that has not adopted the check is not checked"
    (mt/with-temp [:model/ContentTranslation _ {:locale "de" :msgid "a" :msgstr "b"}]
      (is (not (value-guard-rejected? #(t2/select :model/ContentTranslation hostile)))))))
