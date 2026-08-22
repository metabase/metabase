(ns metabase.app-db.honeysql-guard-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [honey.sql :as sql]
   [metabase.app-db.honeysql-guard :as honeysql-guard]
   [metabase.app-db.query :as mdb.query]
   [metabase.util.json :as json]
   [toucan2.core :as t2]
   [toucan2.honeysql2 :as t2.honeysql]
   [toucan2.pipeline :as t2.pipeline]))

(defn- safe? [q] (honeysql-guard/safe-syntax? q))

;;; --------------------- raw/inline forms are refused in every clause position, not only :where ----------------------

(deftest ^:parallel raw-and-inline-forms-refused-in-all-clause-positions-test
  (testing "an unmarked [:raw ...] or [:inline string] form is refused wherever it appears -- select, from, group-by,
           order-by, returning, join, and nested -- not only in a :where value"
    (are [q] (not (safe? q))
      ;; a whole [:raw ...] entry in :group-by
      {:select [:id] :from [:core_user]
       :group-by [[:raw "id UNION ALL SELECT password FROM core_user --"]]}
      ;; same shape, other clauses
      {:select [[:raw "x"]] :from [:core_user]}
      {:select [:id] :from [[:raw "core_user"]]}
      {:select [:id] :from [:core_user] :order-by [[:raw "1"]]}
      {:insert-into [:core_user] :values [{:a 1}] :returning [[:raw "*"]]}
      {:select [:id] :from [:core_user] :join [[:raw "u"] [:= :u.id :core_user.id]]}
      ;; a [:raw ...] hidden as a group-by expression list, not a pair
      {:select [:id] :from [:core_user] :group-by [:id [:raw "(SELECT 1)"]]}
      ;; [:inline string] escapes the scalar-only rule in a column-list slot
      {:select [:id] :from [:core_user] :group-by [[:inline "x)--"]]}
      {:select [[:inline "y"]] :from [:core_user]}
      ;; a nested clause map as a whole entry
      {:select [:id] :from [:core_user] :group-by [{:select [:x] :from [:y]}]}
      ;; the PR's own stated goal, in :group-by -- renders GROUP BY A B C(?)
      {:select [:id] :from [:core_user] :group-by [[:a-b-c 1]]})))

;;; ------------------- a multi-token head is refused in every clause and construct, not only :where -------------------

(deftest ^:parallel multi-token-head-refused-in-every-construct-test
  (testing "a head HoneySQL would render unquoted is refused wherever it appears -- CTE names, window/over,
           lateral, set-ops, having, order-by direction, joins, :call, and nested subqueries"
    (are [q] (not (safe? q))
      ;; CTE name
      {:with [[(keyword "cte-OR-1=1") {:select [1]}]] :select [:*] :from [(keyword "cte-OR-1=1")]}
      {:with-recursive [[:x {:select [1]}]] :select [(keyword "a-b-c")] :from [:x]}
      ;; window / over / partition-by head
      {:select [[[(keyword "row-num-OR-1") :over []] :r]] :from [:t]}
      {:select [[[:count :*] [:over [[:partition-by [(keyword "a-b")]]]]]] :from [:t]}
      ;; lateral / set-op / having / filter
      {:select [:*] :from [[[:lateral [(keyword "a-b-c") 1]] :l]]}
      {:union [{:select [(keyword "a-b-c")] :from [:t]} {:select [1]}]}
      {:select [:id] :from [:t] :group-by [:id] :having [(keyword "cnt-OR-1=1") 1]}
      ;; ORDER BY direction slot renders via sql-kw too
      {:select [:x] :from [:t] :order-by [[:col (keyword "x-OR-1=1")]]}
      ;; :call names its function in the second element, keyword or string
      {:select [:id] :where [:call (keyword "a-b") 1]}
      {:select [:id] :where [:call "a b" 1]}
      ;; a head in a marked subquery's :where is still refused, and a raw form nested in a group-by function arg
      {:select [:id] :where [:in :id ^:allow-subquery {:select [:id] :from [:t] :where [(keyword "a-b-c") 1]}]}
      {:select [:id] :from [:t] :group-by [[:coalesce [:raw "evil"] :b]]})))

(deftest ^:parallel clause-words-and-legit-constructs-are-allowed-test
  (testing "registered clause words render several fixed words but are trusted structure, not multi-token heads"
    (are [q] (safe? q)
      {:insert-into [:core_user] :values [{:a 1}]}
      {:drop-table [:if-exists :t]}
      {:create-table [:if-not-exists :t]}
      {:update [:core_user] :set {:a 1} :where [:= :id 1]}
      ;; set-op branches and CTE bodies are subqueries, marked ^:allow-subquery as the codebase writes them
      {:union [^:allow-subquery {:select [:a] :from [:t]} ^:allow-subquery {:select [:b] :from [:u]}]}
      {:union-all [^:allow-subquery {:select [:a] :from [:t]} ^:allow-subquery {:select [:b] :from [:u]}]}
      {:with [[:cte ^:allow-subquery {:select [:id] :from [:t]}]] :select [:*] :from [:cte]}
      {:select [[:call "my_fn" 1]] :from [:t]}))
  (testing "a legit lateral subquery (marked) and an ordinary-head having compile"
    (are [q] (safe? q)
      {:select [:*] :from [[[:lateral ^:allow-subquery {:select [:x] :from [:t]}] :l]]}
      {:select [:id] :from [:t] :group-by [:id] :having [:> [:count :*] 1]}))
  (testing "FOR UPDATE / FOR SHARE lock strengths and modifiers are HoneySQL vocabulary, rendered via sql-kw"
    (are [q] (safe? q)
      {:select [:id] :from [:t] :for [:update :skip-locked]}
      {:select [:id] :from [:t] :for [:update :nowait]}
      {:select [:id] :from [:t] :for [:no-key-update]}
      {:select [:id] :from [:t] :for [:share]}
      {:select [:id] :from [:t] :lock [:update]}))
  (testing "ORDER BY null-ordering directions render multi-word via sql-kw but are HoneySQL vocabulary"
    (are [q] (safe? q)
      {:select [:id] :from [:t] :order-by [[:x :nulls-first]]}
      {:select [:id] :from [:t] :order-by [[:x :nulls-last]]}
      {:select [:id] :from [:t] :order-by [[:x :asc-nulls-first]]}
      {:select [:id] :from [:t] :order-by [[:x :asc-nulls-last]]}
      {:select [:id] :from [:t] :order-by [[:x :desc-nulls-first]]}
      {:select [:id] :from [:t] :order-by [[:x :desc-nulls-last]]}))
  (testing "SELECT DISTINCT ON and the null predicates are unregistered HoneySQL vocabulary rendered multi-word"
    (are [q] (safe? q)
      {:select-distinct-on [[:a] :b] :from [:t]}
      {:select [:x] :from [:t] :where [:is-null :x]}
      {:select [:x] :from [:t] :where [:is-not-null :x]})))

;;; ------------------------------------------------- form heads -------------------------------------------------------

(deftest ^:parallel head-with-token-splitting-char-is-refused-test
  (testing "a head whose name carries whitespace or a delimiter renders as more than one SQL token, so it is refused"
    (are [q] (not (safe? q))
      {:select [:id] :from [:core_user] :where [(keyword "a b") 1]}
      {:select [:id] :from [:core_user] :where [(keyword "a b c") 1]}
      {:select [:id] :from [:core_user] :where [(keyword "foo(bar") 1]}
      {:select [:id] :from [:core_user] :where [(keyword "a;b") 1]}
      {:select [:id] :from [:core_user] :where [(keyword "a,b") 1]})))

(deftest ^:parallel head-with-hyphen-is-refused-test
  (testing "`sql-kw` turns each `-` into a space, so a hyphenated head renders as more than one token and is refused"
    (are [q] (not (safe? q))
      ;; :a-b-c renders A B C(?)
      {:select [:id] :from [:core_user] :where [(keyword "a-b-c") 1]}
      {:select [:id] :from [:core_user] :where [(keyword "one-two") 1]})))

(deftest ^:parallel head-nested-in-an-expression-is-refused-test
  (testing "a multi-token head nested inside an argument, list, or boolean is still an expression-position head"
    (are [q] (not (safe? q))
      {:select [:id] :where [:= :id [(keyword "a-b") 2]]}
      {:select [:id] :where [:= :id (list (keyword "a b") 1)]}
      {:select [:id] :where [:and [:= :a 1] [(keyword "b-c") 2]]}
      {:select [:id] :where [:or [:= :a 1] [:in :b [(keyword "c-d") 1]]]}
      {:select [:id] :having [(keyword "a-b") 1]})))

(deftest ^:parallel underscore-head-is-a-single-token-and-is-allowed-test
  (testing "`_` does not render to a space, so an underscore name stays a single token"
    (are [q] (safe? q)
      {:select [:id] :where [:do_thing 1]}
      {:select [:id] :where [:some_udf 1 2]}
      {:select [:id] :where [:a_b_c 1]})))

(deftest ^:parallel registered-and-generic-function-heads-are-allowed-test
  (testing "registered operators and special forms are allowed, including the ones that render several fixed words"
    (are [q] (safe? q)
      {:select [:id] :where [:not-in :id [1 2]]}
      {:select [:id] :where [:in :id [1 2]]}
      {:select [:id] :where [:is-not :first_name nil]}
      {:select [:id] :where [:= :id 1]}
      {:select [:id] :where [:like :name "%x%"]}
      {:select [:id] :where [:and [:= :a 1] [:= :b 2]]}
      {:select [:id] :where [:= :id [:- :id 1]]}
      {:select [:id] :where [:= :id [:cast :x :integer]]}))
  (testing "generic single-token SQL functions are unregistered but allowed on the single-token rule"
    (are [q] (safe? q)
      {:select [[[:count :*] :c]] :from [:core_user]}
      {:select [:id] :where [:= :first_name [:lower :last_name]]}
      {:select [:id] :where [:= :x [:coalesce :a :b]]}
      {:select [[:%count.* :c]] :from [:core_user]})))

;;; --------------------------------- hyphenated identifiers in non-head positions -------------------------------------

(deftest ^:parallel hyphenated-identifier-in-non-head-position-is-allowed-test
  (testing "the same hyphenated keyword is a quoted identifier as an alias, column, or direction and is not head-checked"
    (are [q] (safe? q)
      ;; alias slot of a select pair, referenced by :order-by
      {:select [[[:lower :p.name] :lower-name]] :from [[:pulse :p]] :order-by [[:lower-name :asc]]}
      ;; hyphenated table-qualified column as the expr slot of a select pair
      {:select [[:model-index-value.model_pk :id]] :from [[:model_index_value :model-index-value]]}
      {:select [[:ts.count :num-fields] [:fk-field.id :f1]] :from [[:metabase_field :fk-field]]}
      {:select [[:p.group_id :group-id] [:p.perm_type :perm-type]] :from [:p]}
      ;; hyphenated column in :order-by / :group-by
      {:select [:x] :from [:t] :order-by [[:fk-field.id :desc]]}
      {:select [:x] :from [:t] :group-by [:some-col]}
      ;; hyphenated table alias in :from / join
      {:select [:x] :from [[:core_user :the-user]]}
      {:select [:x] :from [:t] :left-join [[:login :the-login] [:= :the-login.uid :t.id]]})))

;;; -------------------------------------------- bare clause values ----------------------------------------------------

(deftest ^:parallel bare-clause-values-do-not-error-test
  (testing "a clause may hold a bare keyword rather than a vector; the guard handles it without throwing"
    (are [q] (safe? q)
      {:select :* :from :core_user}
      {:select :id :from :core_user :group-by :id}
      {:select [:id] :from :core_user :order-by :id})))

;;; ------------------------------------------- nested maps / subqueries -----------------------------------------------

(deftest ^:parallel unmarked-nested-map-is-refused-test
  (testing "any unmarked nested HoneySQL map -- subquery, splice, or DDL -- is refused"
    (are [q] (not (safe? q))
      {:select [:id] :where [:= :id {:select [:password_hash] :from [:core_user] :limit 1}]}
      {:select [:id] :where [:in :id {:select [:id] :from [:core_user]}]}
      {:select [:id] :where [:= :id {:union [{:select [1]} {:select [2]}]}]}
      {:select [:id] :where [:= :id {:raw "1=1"}]}
      {:select [:id] :where [:= :id {:drop-table :core_user}]}
      {:select [:id] :where [:and [:= :a 1] [:= :b {:select [:x] :from [:y]}]]}
      {:select [:id] :where [:= :id (json/decode+kw "{\"select\": \"*\"}")]}
      {:raw "drop table core_user"})))

(deftest ^:parallel marked-subquery-is-allowed-one-level-test
  (testing "a nested map marked ^:allow-subquery is permitted, and the marker is one level deep"
    (is (safe? {:select [:id] :where [:in :id ^:allow-subquery {:select [:id] :from [:core_user]}]}))
    (is (not (safe? {:select [:id]
                     :where  [:in :id ^:allow-subquery {:select [:id] :from [:core_user]
                                                        :where  [:in :id {:select [:x] :from [:y]}]}]})))
    (is (safe? {:select [:id]
                :where  [:in :id ^:allow-subquery {:select [:id] :from [:core_user]
                                                   :where  [:in :id ^:allow-subquery {:select [:x] :from [:y]}]}]})))
  (testing "a multi-token head is still refused inside a marked subquery"
    (is (not (safe? {:select [:id]
                     :where  [:in :id ^:allow-subquery {:select [:id] :from [:core_user]
                                                        :where  [(keyword "a-b") 1]}]})))))

(deftest ^:parallel decoded-input-cannot-carry-a-marker-test
  ;; JSON decoding produces plain maps with no Clojure metadata, so a request body cannot supply `^:allow-subquery`:
  ;; the marker exists only when source code attaches it to a literal. A decoded map is therefore refused in exactly
  ;; the positions where a source-written subquery is allowed. `vary-meta` here stands in for a hypothetical future
  ;; caller that marks decoded input by mistake -- even then the nested map it carries stays refused.
  (testing "a decoded map is refused where a source-written subquery would be marked"
    (let [decoded (json/decode+kw "{\"select\": [\"password_hash\"], \"from\": [\"core_user\"]}")]
      (is (nil? (meta decoded)))
      (are [q] (not (safe? q))
        {:select [:id] :where [:in :id decoded]}
        {:select [:id] :from [[decoded :sub]]}
        {:with [[:cte decoded]] :select [:*] :from [:cte]}
        {:union-all [decoded ^:allow-subquery {:select [:id] :from [:core_user]}]})))
  (testing "marking a decoded map does not launder the untrusted map nested inside it"
    (let [decoded (json/decode+kw "{\"select\": [\"id\"], \"from\": [\"core_user\"], \"where\": [\"in\", \"id\", {\"raw\": \"1=1\"}]}")]
      (is (not (safe? {:select [:id] :where [:in :id (vary-meta decoded assoc :allow-subquery true)]}))))))

;;; --------------------------------------------- raw / inline forms ---------------------------------------------------

(deftest ^:parallel raw-and-inline-forms-are-guarded-test
  (testing "a [:raw ...] form is refused unless it carries ^:allow-raw-sql"
    (are [q] (not (safe? q))
      {:select [:id] :where [:= :id [:raw "(SELECT 1)"]]}
      {:select [:id] :where [:= :id (list :raw "(SELECT 1)")]}
      {:select [:id] :where [:= :id {:raw "1=1"}]})
    (is (safe? {:select [:id] :where ^:allow-raw-sql [:raw "current_timestamp"]})))
  (testing "an [:inline x] with a string/keyword is refused unless marked; nil/boolean/number is allowed"
    (are [q] (not (safe? q))
      {:select [:id] :where [:= :id [:inline "abc"]]}
      {:select [:id] :where [:= :id [:inline :some-kw]]}
      {:select [:id] :where [:= :id {:inline "1=1"}]})
    (are [q] (safe? q)
      {:select [:id] :where [:= :id [:inline 5]]}
      {:select [:id] :where [:= :id [:inline true]]}
      {:select [:id] :where [:= :id [:inline nil]]}
      {:select [:id] :where [:in :id [:inline [1 2 3]]]}
      {:select [:id] :where [:= :id ^:allow-raw-sql [:inline "shared-tenant"]]})))

;;; ------------------------------------------ data positions / DDL ----------------------------------------------------

(deftest ^:parallel data-positions-are-allowed-test
  (testing "an INSERT :values row and an UPDATE :set map are data; the container is allowed"
    (are [q] (safe? q)
      {:insert-into [:core_user] :values [{:first_name "x" :last_name "y"}]}
      {:insert-into [:core_user] :values [(json/decode+kw "{\"first_name\": \"x\"}")]}
      {:update [:core_user] :set {:first_name "x"} :where [:= :id 5]}))
  (testing "but a nested clause map as a column value is still refused"
    (are [q] (not (safe? q))
      {:insert-into [:core_user] :values [{:first_name {:raw "sql"}}]}
      {:update [:core_user] :set {:first_name {:select [:x] :from [:y]}} :where [:= :id 5]})))

(deftest ^:parallel ddl-modifier-heads-are-allowed-test
  (testing "DDL modifier heads render as fixed clause words"
    (are [q] (safe? q)
      {:drop-table [:if-exists :some_table]}
      {:create-table [:if-not-exists :some_table]})))

;;; ------------------------------------------ end-to-end via the pipeline ---------------------------------------------

(deftest refused-at-compile-time-test
  (testing "a JSON subquery map reaches the pipeline and is refused"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL clause reached the app-DB compile step"
         (t2/compile (t2/select :model/User :id (json/decode+kw "{\"select\": [\"password_hash\"], \"from\": [\"core_user\"], \"limit\": 1}"))))))
  (testing "a multi-token form head is refused at compile time, and the error names the offending head"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL form head reached the app-DB compile step: :a-b"
         (t2.pipeline/compile :toucan.query-type/select.instances :model/User
                              {:select [:id] :from [:core_user] :where [(keyword "a-b") 1]})))
    (let [e (try (t2.pipeline/compile :toucan.query-type/select.instances :model/User
                                      {:select [:id] :from [:core_user] :where [(keyword "a-b") 1]})
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (= :a-b (:metabase.app-db.honeysql-guard/bad-head (ex-data e))))
      (is (= :metabase.app-db.honeysql-guard/forbidden-head (:type (ex-data e))))))
  (testing "an exists? subquery, marked by the build hook, compiles fine"
    (is (t2/compile (t2/exists? :model/User :id 5))))
  (testing "a plain scalar condition and a marked subquery compile fine"
    (is (t2/compile (t2/select :model/User :id 5)))
    (is (t2.pipeline/compile :toucan.query-type/select.instances :model/User
                             {:select [:id] :from [:core_user]
                              :where  [:in :id ^:allow-subquery {:select [:id] :from [:core_user] :where [:= :id 5]}]}))))

;;; ---------------------------- the guard also fences mdb/query, which compiles outside the pipeline ------------------

(deftest mdb-query-compile-is-guarded-test
  (testing "check-syntax! refuses an unmarked nested map and a multi-token head, and passes a legit map"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL clause reached the app-DB compile step"
         (honeysql-guard/check-syntax! {:select [:id] :where [:= :id {:raw "1=1"}]})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL form head reached the app-DB compile step: :a-b"
         (honeysql-guard/check-syntax! {:select [:id] :from [:core_user] :where [(keyword "a-b") 1]})))
    (is (= {:select [:id] :from [:core_user]} (honeysql-guard/check-syntax! {:select [:id] :from [:core_user]}))))
  (testing "mdb/query's map compile runs the guard before formatting, so a forbidden map never reaches the database"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL clause reached the app-DB compile step"
         (mdb.query/compile {:select [:id] :from [:core_user] :where [:= :id {:raw "1=1"}]})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"forbidden HoneySQL form head reached the app-DB compile step: :a-b"
         (mdb.query/compile {:select [:id] :from [:core_user] :where [(keyword "a-b") 1]}))))
  (testing "a pre-formatted [sql & params] vector passes through mdb/query untouched, never reaching the guard"
    (is (= ["SELECT 1"] (mdb.query/compile ["SELECT 1"])))
    (is (= ["SELECT ?" 1] (mdb.query/compile ["SELECT ?" 1]))))
  (testing "a marked [:raw \"?\"] placeholder (the cluster-lock queries) is allowed through mdb/query"
    (are [q] (honeysql-guard/safe-syntax? q)
      {:select [:lock.lock_name] :from [[:metabase_cluster_lock :lock]]
       :where  [:= :lock.lock_name ^:allow-raw-sql [:raw "?"]]}
      {:insert-into [:metabase_cluster_lock] :columns [:lock_name]
       :values      [[^:allow-raw-sql [:raw "?"]]]})))

;;; --------------------------------------------- property-based tests -------------------------------------------------
;;;
;;; Oracle: format a query with an instrumented `sql-kw` and record every keyword/string HoneySQL renders unquoted.
;;; A query is head-safe by ground truth iff every recorded name is `allowed-head?`. The guard must agree with this
;;; oracle, and must additionally refuse unmarked raw/inline/nested-map structure that never reaches `sql-kw`.

(def ^:private orig-sql-kw @#'sql/sql-kw)

(defn- unquoted-names!
  "Every keyword/string HoneySQL renders unquoted (via sql-kw) while formatting `q`, or :threw."
  [q]
  (let [seen (atom [])]
    (try
      (with-redefs [sql/sql-kw (fn [k] (when (or (keyword? k) (string? k)) (swap! seen conj k)) (orig-sql-kw k))]
        (sql/format q @t2.honeysql/global-options))
      @seen
      (catch Throwable _ :threw))))

(defn- allowed-head?* [f] (#'honeysql-guard/allowed-head? f))

;; generators: forbidden heads and legit shapes.
(def ^:private gen-forbidden-head
  (gen/elements [(keyword "id-OR-1=1") (keyword "a b") (keyword "x-UNION-SELECT-pw")
                 (keyword "foo(bar") (keyword "a;b") "a b" "x-y-z"]))

;; legit heads split by clause: a function head is a projectable expression (valid in :select and :where); an
;; operator head is a boolean (valid only in :where). `gen-legit-head` covers both, for the reject/allow specs that
;; only care whether a head passes.
;; plain generic functions that render as HEAD(args); `:cast` and other special-syntax forms have their own arity
;; and argument shape, so they are exercised in the example-based tests, not the generator.
(def ^:private gen-legit-fn (gen/elements [:count :lower :coalesce :do_thing :abs :upper :length]))
(def ^:private gen-legit-op (gen/elements [:= :< :not-in :is-not :and :or :like]))
(def ^:private gen-legit-head (gen/one-of [gen-legit-fn gen-legit-op]))

(def ^:private gen-column (gen/elements [:id :name :core_user.id :a-b :lower-name :x :y]))

(def ^:private gen-leaf (gen/one-of [gen-column (gen/return 1) (gen/return "s")]))

;; a shallow *projectable* expression: a leaf, or a (possibly forbidden-headed) function call. Function-call
;; expressions carry two arguments so HoneySQL always renders them as a call `HEAD(?, ?)`, never as an ambiguous
;; `[expr alias]` pair, so a generated query is always a valid, formattable HoneySQL form. Operators are excluded
;; here because a bare operator is a boolean, not a select expression.
(def ^:private gen-expr
  (gen/one-of
   [gen-leaf
    (gen/fmap (fn [[h a b]] [h a b]) (gen/tuple gen-legit-fn gen-leaf gen-column))
    (gen/fmap (fn [[h a b]] [h a b]) (gen/tuple gen-forbidden-head gen-leaf gen-column))]))

;; an aliased select entry: [expr alias].
(def ^:private gen-select-entry
  (gen/one-of
   [gen-expr
    (gen/fmap (fn [[e a]] [e a]) (gen/tuple gen-expr (gen/elements [:al :lower-name :a-b])))]))

;; a :where value is a boolean expression: an operator/forbidden head applied to columns.
(def ^:private gen-where
  (gen/fmap (fn [[h args]] (into [h] args))
            (gen/tuple (gen/one-of [gen-legit-op gen-forbidden-head])
                       (gen/vector gen-column 1 2))))

(defn- honeysql-formattable?
  "True if the plain HoneySQL formatter accepts `q`. Some generated shapes (a boolean where a projection is expected,
  a special form given the wrong arity) are not valid HoneySQL; filtering them out keeps every generated query a form
  the guard's head oracle can actually inspect."
  [q]
  (try (string? (first (sql/format q @t2.honeysql/global-options)))
       (catch Throwable _ false)))

(def ^:private gen-query
  (gen/such-that
   honeysql-formattable?
   (gen/let [sel  (gen/vector gen-select-entry 1 3)
             frm  gen-column
             wher gen-where
             gb   (gen/vector (gen/one-of [gen-column gen-expr]) 0 2)
             ob   (gen/vector (gen/vector gen-column 1 2) 0 2)
             add-where? gen/boolean]
     (cond-> {:select sel :from [frm]}
       add-where? (assoc :where wher)
       (seq gb)      (assoc :group-by gb)
       (seq ob)      (assoc :order-by ob)))
   {:max-tries 50}))

(defspec guard-agrees-with-sql-kw-oracle-on-heads 300
  (prop/for-all [q gen-query]
    (let [names  (unquoted-names! q)
          guard  (safe? q)]
      (or (= names :threw)                                   ; honeysql itself rejected -- not our concern
          (let [oracle-head-safe? (every? allowed-head?* names)]
            ;; if the guard passed the query, every unquoted name it will emit must be allowed
            (if guard oracle-head-safe? true))))))

(defspec guard-refuses-any-keyword-forbidden-head 300
  ;; a keyword forbidden name as a form head (a call with args, so HoneySQL renders it via sql-kw) must be refused. A
  ;; string first element is a value list, not a head, so this uses keyword forbidden names with an argument.
  (prop/for-all [forbidden (gen/such-that keyword? gen-forbidden-head)
                 slot     (gen/elements [:where :having])]
    (let [q     {:select [:id] :from [:t] :group-by [:id] slot [forbidden 1]}
          names (unquoted-names! q)]
      ;; ground truth: the name reaches sql-kw and is disallowed => must be refused
      (if (and (not= names :threw) (some #(= forbidden %) names))
        (not (safe? q))
        true))))

(defspec guard-allows-legit-heads-and-hyphenated-aliases 300
  (prop/for-all [head gen-legit-head
                 alias (gen/elements [:lower-name :group-id :num-fields :fk-field.id :a-b-c])]
    (safe? {:select [[[head :id] alias]] :from [:t] :order-by [[alias :asc]]})))

(defspec generated-queries-are-honeysql-formattable 300
  ;; Every generated query must be a valid, formattable HoneySQL form. This guards the other property specs: their
  ;; head oracle inspects the query by formatting it, and an un-formattable query would make that oracle pass
  ;; vacuously (it short-circuits on a format error), silently reducing coverage. With the `*checking-heads?*` flag
  ;; unbound, `sql/format` here is the plain HoneySQL formatter, so this asserts generator validity, not the guard.
  (prop/for-all [q gen-query]
    (string? (first (sql/format q @t2.honeysql/global-options)))))
