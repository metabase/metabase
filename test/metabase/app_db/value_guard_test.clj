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

(deftest ^:parallel refuses-a-marker-outside-a-value-slot-test
  (testing "a marker in a clause that names columns or tables is refused"
    ;; Without this the lift rewrites the marker wherever it sits, and HoneySQL formats the result
    ;; in an identifier slot as the literal identifier `param` -- dropping the value with no signal.
    (are [query] (= ::value-guard/marker-outside-value-slot
                    (try (#'value-guard/check-marker-placement query) nil
                         (catch clojure.lang.ExceptionInfo e (:type (ex-data e)))))
      {:select [[:auto/param "name"]] :from [:t]}
      {:select [:*] :from [[[:auto/param "t"]]]}
      ;; an ALIAS slot -- HoneySQL tells [expr alias] apart positionally, so a marker after
      ;; index 0 is always an identifier. This compiled to `FROM t AS param k` before.
      {:select [:*] :from [[:t [:auto/param "al"]]]}
      {:select [[:a [:auto/param "al"]]] :from [:t]}
      ;; :cross-join takes only tables -- no ON condition -- so every element is an identifier
      {:select [:*] :from [:a] :cross-join [:b [:auto/param "c"]]}
      {:create-table :t :with-columns [[[:auto/param "c"] :int]]}
      ;; the whole clause value is a marker -- read as a list of entries, it splits into
      ;; `:auto/param` and the payload, neither a marker. This compiled to `FROM param, k` before.
      {:select [:*] :from [:auto/param "t"]}
      {:update [:auto/param "t"] :set {:a 1}}
      {:select [:*] :from [:t] :join [:auto/param "u"]}))
  (testing ":order-by and :group-by bind a param, so a marker there is a no-op rather than a drop"
    ;; `{:order-by [[[:param :k] :asc]]}` compiles to `ORDER BY ? ASC` with the value bound --
    ;; nothing is discarded, so refusing it would turn a harmless mistake into an exception.
    (are [query] (nil? (#'value-guard/check-marker-placement query))
      {:select [:*] :from [:t] :order-by [[[:auto/param "a"] :asc]]}
      {:select [:*] :from [:t] :group-by [[:auto/param "a"]]}))
  (testing "a marker in a genuine value slot is left alone"
    (are [query] (nil? (#'value-guard/check-marker-placement query))
      {:select [:*] :from [:t] :where [:= :a [:auto/param 1]]}
      {:where [:auto/param :locale "de"]}
      ;; a join alternates table and ON condition; the condition is a value slot
      {:select [:*] :from [:t] :join [:u [:= :t.a [:auto/param 1]]]}))
  (testing "a marker in an expression inside an identifier clause is a real value slot"
    ;; A computed projection or a CASE sort key puts a genuine comparison in a clause that
    ;; otherwise holds identifiers. Refusing these would break a namespace that grows one later.
    (are [query] (nil? (#'value-guard/check-marker-placement query))
      {:select [[[:= :engine [:auto/param "h2"]] :is_match]] :from [:t]}
      {:select [:*] :from [:t] :order-by [[[:case [:= :a [:auto/param 1]] 1 :else 2] :asc]]}
      {:select [:*] :from [:t] :group-by [[:coalesce :a [:auto/param 1]]]}))
  (testing "a subquery's OWN identifier clauses are scanned too"
    ;; The scan recurses, so a marker one level down in a nested :select is still refused -- it
    ;; would otherwise compile to the identifier `param` inside the subquery and drop the value.
    (is (= ::value-guard/marker-outside-value-slot
           (try (#'value-guard/check-marker-placement
                 {:select [[[:exists {:select [[:auto/param "name"]] :from [:t]}] :e]]})
                nil
                (catch clojure.lang.ExceptionInfo e (:type (ex-data e)))))))
  (testing "a subquery has its own clauses, so an outer identifier slot holding one is not scanned"
    ;; `t2/exists?` wraps the whole query in `:select [[[:exists {...}]]]`, and that inner map's
    ;; `:where` is a real value slot. Scanning the outer `:select` wholesale would reject it.
    (is (nil? (#'value-guard/check-marker-placement
               {:select [[[:exists {:select [[[:inline 1]]]
                                    :from   [[:content_translation]]
                                    :where  [:auto/param :locale "de"]}] :exists]]})))))

(deftest ^:parallel marker-at-index-0-of-an-entry-test
  (testing "a marker directly at index 0 of an [expr alias] entry is bound where that index is an expression"
    ;; `{:select [[[:param :k] :a]]}` compiles to `SELECT ? AS a` -- the value is bound, not dropped.
    (are [query] (nil? (#'value-guard/check-marker-placement query))
      {:select [[[:auto/param 1] :a]] :from [:t]}
      {:select-distinct [[[:auto/param 1] :a]] :from [:t]}
      {:delete-from :t :returning [[[:auto/param 1] :a]]})
    (is (= ["SELECT ? AS a FROM t" 1]
           (formatted {:select [[[:auto/param 1] :a]] :from [:t]}))))
  (testing "a marker at index 0 of a table entry is still refused"
    ;; HoneySQL binds it -- `FROM ? AS a` -- but a table cannot be a parameter, so the statement
    ;; fails at the database. Refusing here names the mistake instead.
    (are [query] (= ::value-guard/marker-outside-value-slot
                    (try (#'value-guard/check-marker-placement query) nil
                         (catch clojure.lang.ExceptionInfo e (:type (ex-data e)))))
      {:select [:*] :from [[[:auto/param "t"] :a]]}
      {:select [:*] :from [:t] :join [[[:auto/param "u"] :a] [:= 1 1]]})))
