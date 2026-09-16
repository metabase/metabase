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
  (testing "the lift binds a map rather than letting HoneySQL compile it"
    ;; Note this exercises the lift alone. Through the pipeline a `{:raw ...}` never reaches it:
    ;; `honeysql-guard` runs `:before` this `:around` and rejects the payload while it is still
    ;; inline. See `metabase.app-db.params-test` for what a query actually does with one.
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
  (testing "a marker written any way but [:auto/param value] is a mistake, not a value"
    (are [query] (thrown-with-msg? clojure.lang.ExceptionInfo #"Malformed"
                                   (#'value-guard/auto-param query))
      {:where [:= :a [:auto/param]]}
      {:where [:= :a [:auto/param 1 2 3]]}
      {:where [:= :a (list :auto/param 5)]})))

(deftest ^:parallel binds-a-marked-kv-arg-test
  (testing "Toucan folds a marked kv-arg into [:auto/param column value]; it comes back as a comparison"
    (is (= ["WHERE locale = ?" "de"]
           (formatted {:where [:auto/param :locale "de"]}))))
  (testing "a marked kv-arg holding nil still compares as IS NULL"
    (is (= ["WHERE locale IS NULL"]
           (formatted {:where [:auto/param :locale nil]})))))

(deftest ^:parallel leaves-nil-to-honeysql-test
  (testing "a bound nil compares as `= ?`, which no row satisfies -- leave it a literal so it is IS NULL"
    (is (= (sql/format {:where [:= :a nil]})
           (formatted {:where [:= :a [:auto/param nil]]})))))

(deftest ^:parallel leaves-an-unmarked-query-alone-test
  (let [query {:select [:*] :from [:t] :where [:= :a 1]}]
    (is (= [query {}] (#'value-guard/auto-param query)))))
