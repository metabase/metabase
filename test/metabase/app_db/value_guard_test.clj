(ns metabase.app-db.value-guard-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.app-db.value-guard :as value-guard]))

(defn- formatted
  "Lift the markers in `query` and compile it, as the app-DB compile step does."
  [query]
  (let [[form params] (#'value-guard/auto-param query)]
    (sql/format form {:params params})))

(deftest ^:parallel binds-a-marked-value-test
  (is (= ["WHERE a = ?" 5]
         (formatted {:where [:= :a [:auto/param 5]]}))))

(deftest ^:parallel binds-a-value-that-would-otherwise-compile-as-sql-test
  (testing "a marked map is bound as a parameter rather than compiled into the statement"
    (let [payload {:raw "(SELECT password FROM core_user)"}]
      (is (= ["WHERE a = ?" payload]
             (formatted {:where [:= :a [:auto/param payload]]}))))))

(deftest ^:parallel binds-each-marker-separately-test
  (is (= ["WHERE (a = ?) AND (b = ?)" 1 2]
         (formatted {:where [:and [:= :a [:auto/param 1]] [:= :b [:auto/param 2]]]}))))

(deftest ^:parallel marks-a-value-shaped-like-a-marker-test
  (testing "a marker's payload is the value, even when the payload is itself marker-shaped"
    (is (= ["WHERE a = ?" [:auto/param 5]]
           (formatted {:where [:= :a [:auto/param [:auto/param 5]]]})))))

(deftest ^:parallel param-keys-cannot-be-named-by-request-data-test
  (testing "a [:param k] arriving in a value slot cannot name a slot this query minted"
    (let [from-request [:param :p1]
          [form params] (#'value-guard/auto-param
                         {:where [:and
                                  [:= :locale [:auto/param "secret"]]
                                  [:= :msgid from-request]]})]
      (is (thrown-with-msg? Exception #"missing parameter value"
                            (sql/format form {:params params}))))))

(deftest ^:parallel leaves-a-map-keyed-by-the-marker-alone-test
  (testing "a map entry is also a two-element vector, so a map keyed by the marker must survive"
    (are [query] (= [query {}] (#'value-guard/auto-param query))
      {:auto/param 5}
      {:where [:= :a 1] :set {:auto/param "x"}})))

(deftest ^:parallel rejects-a-malformed-marker-test
  (testing "a marker-headed vector of the wrong arity is a mistake, not a value"
    (are [query] (thrown-with-msg? clojure.lang.ExceptionInfo #"takes exactly one value"
                                   (#'value-guard/auto-param query))
      {:where [:= :a [:auto/param]]}
      {:where [:= :a [:auto/param 1 2]]})))

(deftest ^:parallel leaves-an-unmarked-query-alone-test
  (let [query {:select [:*] :from [:t] :where [:= :a 1]}]
    (is (= [query {}] (#'value-guard/auto-param query)))))
