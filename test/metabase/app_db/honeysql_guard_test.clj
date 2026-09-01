(ns metabase.app-db.honeysql-guard-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase.app-db.honeysql-guard :as honeysql-guard]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- safe?
  [query]
  (honeysql-guard/safe-syntax? query))

(deftest ^:parallel plain-identifier-heads-test
  (testing "a head that looks like a function name is allowed"
    (doseq [query [{:select [[[:lower :name]]] :from [:core_user]}
                   {:select [[[:count :*]]] :from [:core_user]}
                   {:select [[[:md5 :name]]] :from [:core_user]}
                   {:select [[[:pg_catalog.now]]] :from [:core_user]}]]
      (is (safe? query) (pr-str query))))
  (testing "a head Honey SQL doesn't know and that isn't a plain identifier is rejected"
    (doseq [query [;; a `-` renders as a space, so one head becomes several SQL words
                   {:select [[[:two-words 1]]] :from [:core_user]}
                   {:select [:*] :from [:core_user] :where [:= :id [:some-fn 1]]}
                   {:select [:*] :from [:core_user] :where [(keyword "id\" ") 1]}]]
      (is (not (safe? query)) (pr-str query)))))

(deftest ^:parallel operator-heads-test
  (testing "operators Honey SQL knows are allowed even though they aren't plain identifiers"
    (doseq [query [{:select [:*] :from [:core_user] :where [:not-in :id [1 2]]}
                   {:select [:*] :from [:core_user] :where [:in :id [1 2]]}
                   {:select [:*] :from [:core_user] :where [:not= :id 1]}
                   {:select [:*] :from [:core_user] :where [:not-like :name "a%"]}
                   {:select [:*] :from [:core_user] :where [:not-between :id 1 2]}
                   {:select [:*] :from [:core_user] :where [:>= :id 1]}
                   {:select [[[:+ :id 1]]] :from [:core_user]}
                   {:select [[[(keyword "||") :first_name :last_name]]] :from [:core_user]}]]
      (is (safe? query) (pr-str query))))
  (testing "DDL modifiers Honey SQL matches by name are allowed ahead of the entity they apply to"
    (is (safe? {:drop-table [:if-exists :search_index]}))
    (is (not (safe? {:drop-table [:if-exists-two-words :search_index]}))))
  (testing "including the forms we register ourselves"
    (is (safe? {:select [[[::h2x/literal "dashboard"] :model]] :from [:report_dashboard]}))
    (is (safe? {:select [[[::h2x/distinct-count :id]]] :from [:report_dashboard]})))
  (testing "an operator Honey SQL doesn't know renders as a function name, so it holds to the pattern"
    (is (not (sql/registered-op? :two-words)))
    (is (not (sql/registered-fn? :two-words)))
    (is (not (safe? {:select [:*] :from [:core_user] :where [:two-words :id 1]})))))

(deftest ^:parallel symbol-heads-test
  (testing "Honey SQL accepts symbols wherever it accepts keywords, and so does the guard"
    (is (= ["SELECT * FROM t WHERE id NOT IN (?, ?)" 1 2]
           (sql/format {:select [:*] :from [:t] :where ['not-in :id [1 2]]})))
    (is (safe? {:select [:*] :from [:core_user] :where ['not-in :id [1 2]]}))
    (is (not (safe? {:select [[['two-words 1]]] :from [:core_user]})))
    (testing "a symbol can't sneak [:raw ...] or [:inline ...] past the guard"
      (is (not (safe? {:select [:*] :from [:core_user] :where ['raw "some sql"]})))
      (is (not (safe? {:select [:*] :from [:core_user] :where ['inline "some sql"]})))
      (is (not (safe? {'raw "some sql"})))
      (is (not (safe? {'inline "some sql"}))))))

(deftest ^:parallel percent-ident-test
  (testing "`:%fn.arg` idents are allowed when the function name is a plain identifier"
    (doseq [query [{:select [:%now]}
                   {:select [[[:%count.*]]] :from [:core_user]}
                   {:select [:*] :from [:core_user] :order-by [[:%lower.name :asc]]}
                   {:select [:*] :from [:core_user] :where [:= :%lower.email "x@y.com"]}]]
      (is (safe? query) (pr-str query))))
  (testing "the function name of a `:%fn` ident is unquoted SQL, so anything else in it is rejected"
    (doseq [ident [(keyword "%two words")
                   (keyword "%two-words")
                   (keyword "%foo/bar")]]
      (is (not (safe? {:select [ident] :from [:core_user]})) (pr-str ident))
      (is (not (safe? {:select [:*] :from [:core_user] :where [:= :id ident]})) (pr-str ident)))))

(deftest ^:parallel tick-ident-test
  (testing "`:'foo` splices `foo` into the query verbatim and is never allowed"
    (is (= ["SELECT two words FROM \"t\""]
           (sql/format {:select [(keyword "'two words")] :from [:t]} {:quoted true})))
    (is (not (safe? {:select [(keyword "'two words")] :from [:core_user]})))
    (is (not (safe? {:select [:*] :from [:core_user] :where [:= :id (keyword "'two words")]})))))

(deftest ^:parallel ordinary-identifiers-test
  (testing "plain identifiers are allowed wherever they appear"
    (doseq [query [{:select [:u/id] :from [[:core_user :u]]}
                   {:select [:id :name] :from [:core_user]}
                   {:select [:core_user.*] :from [:core_user]}]]
      (is (safe? query) (pr-str query))))
  (testing "an ident that isn't a plain identifier is rejected in any position"
    (doseq [query [{:select [:some-col :id] :from [:core_user]}
                   {:select [:id :some-col] :from [:core_user]}
                   {:select [:*] :from [:core_user] :where [:= (keyword "weird\" name") 1]}]]
      (is (not (safe? query)) (pr-str query))))
  (testing "which costs nothing in practice -- app-DB columns are snake_case"
    (is (safe? {:select [:some_col :id] :from [:core_user]}))))

(deftest ^:parallel order-by-direction-test
  (testing "ORDER BY directions render through sql-kw, so they're allowed by name rather than by shape"
    (doseq [query [{:select [:*] :from [:core_user] :order-by [[:name :asc]]}
                   {:select [:*] :from [:core_user] :order-by [[:name :asc :nulls-last]]}
                   {:select [:*] :from [:core_user] :order-by [[:name :desc-nulls-last]]}]]
      (is (safe? query) (pr-str query))))
  (testing "and anything else in that position is not -- it would render as bare SQL words"
    (is (= ["SELECT * FROM \"t\" ORDER BY \"name\" TWO WORDS"]
           (sql/format {:select [:*] :from [:t] :order-by [[:name :two-words]]} {:quoted true})))
    (is (not (safe? {:select [:*] :from [:core_user] :order-by [[:name :two-words]]})))))

(deftest ^:parallel existing-guards-still-hold-test
  (testing "raw and inline forms"
    (is (not (safe? {:select [:*] :from [:core_user] :where [:raw "some sql"]})))
    (is (safe? {:select [:*] :from [:core_user] :where ^:allow-raw-sql [:raw "some sql"]}))
    (is (safe? {:select [:*] :from [:core_user] :where [:= :id [:inline 1]]}))
    (is (not (safe? {:select [:*] :from [:core_user] :where [:= :id [:inline "1"]]}))))
  (testing "nested maps need marking as deliberate subqueries"
    (is (not (safe? {:select [:*] :from [:core_user] :where [:in :id {:select [:id] :from [:core_user]}]})))
    (is (safe? {:select [:*] :from [:core_user]
                :where  [:in :id ^:allow-subquery {:select [:id] :from [:core_user]}]}))))

(deftest ^:parallel compile-step-test
  (testing "the head check runs where it matters -- at the app-DB compile step, not just in the predicate"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"A forbidden HoneySQL clause reached the app-DB compile step"
         (t2/query {:select [[[:two-words 1]]]})))
    (testing "and lets an ordinary query through"
      (is (some? (t2/query {:select [[[:count :*] :n]] :from [:core_user]}))))))
