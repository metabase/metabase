(ns hooks.metabase.toucan.db-ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]))

(defn- confinement-findings
  "Only the `t2-query-namespace` findings, so these tests are not affected by the query-hygiene
  linter that shares this hook."
  [findings]
  (filter #(= :metabase/t2-query-namespace (:type %)) findings))

(defn- lint-query-call [form ns-sym & [filename modules]]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/t2-query-namespace {:level :warning}
                                                               :metabase/unsafe-app-db-query  {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (let [input  {:node     (hooks/parse-string (pr-str form))
                  :ns       ns-sym
                  :filename (or filename "src/metabase/foo/bar.clj")
                  :config   {:metabase/modules modules}}
          output (toucan.db-ns/lint-query-call input)]
      (is (identical? (:node input) (:node output))
          "the hook must return the node unchanged so Kondo's normal analysis still runs")
      @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel t2-query-must-live-in-db-namespace-test
  (testing "a query call outside a db namespace is flagged"
    (is (=? [{:type    :metabase/t2-query-namespace
              :message #".*`t2/select-one`.*"}]
            (lint-query-call '(t2/select-one :model/Card :id 1) 'metabase.queries.models.card))))
  (testing "metabase.<module>.db is allowed"
    (is (empty? (confinement-findings (lint-query-call '(t2/select-one :model/Card :id 1) 'metabase.queries.db)))))
  (testing "metabase-enterprise.<module>.db is allowed"
    (is (empty? (confinement-findings (lint-query-call '(t2/select-one :model/Card :id 1) 'metabase-enterprise.sandbox.db)))))
  (testing "metabase.driver.<driver>.db is allowed for driver modules"
    (is (empty? (confinement-findings (lint-query-call '(t2/select-one :model/Database :id 1) 'metabase.driver.bigquery-cloud-sdk.db)))))
  (testing "a nested db namespace is not a module db namespace"
    (is (=? [{:type :metabase/t2-query-namespace}]
            (lint-query-call '(t2/query {:select [:*]}) 'metabase.queries.models.db))))
  (testing "a namespace merely ending in db is not a module db namespace"
    (is (=? [{:type :metabase/t2-query-namespace}]
            (lint-query-call '(t2/delete! :model/Card :id 1) 'metabase.queries.dashboards-db))))
  (testing "files in a test source tree are exempt even when the namespace name doesn't look like a test"
    (is (empty? (lint-query-call '(t2/update! :model/User 1 {:sso_source nil}) 'metabase.sso.test-helpers
                                 "test/metabase/sso/test_helpers.clj")))
    (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase-enterprise.remote-sync.test-helpers
                                 "/repo/enterprise/backend/test/metabase_enterprise/remote_sync/test_helpers.clj"))))
  (testing "app-db wrappers around Toucan 2 are reported the same way"
    (is (=? [{:type    :metabase/t2-query-namespace
              :message #".*`mdb/update-or-insert!`.*"}]
            (lint-query-call '(mdb/update-or-insert! :model/Foo {:id 1}) 'metabase.foo.models.foo))))
  (testing "fully-qualified calls are reported by their written name"
    (is (=? [{:type    :metabase/t2-query-namespace
              :message #".*`toucan2.core/insert!`.*"}]
            (lint-query-call '(toucan2.core/insert! :model/Card {}) 'metabase.queries.models.card)))))

(deftest ^:parallel t2-query-namespace-follows-the-module-tree-test
  (let [modules '{queries            {}
                  metabot            {}
                  metabot.llm        {}
                  lib.be             {:ns-prefix "metabase.lib-be"}
                  enterprise/sandbox {}}]
    (testing "a nested module owns its own db namespace"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.metabot.llm.db nil modules))))
    (testing "the parent's db namespace stays its own"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.metabot.db nil modules))))
    (testing "a module with an explicit :ns-prefix is resolved through it, not its dotted name"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.lib-be.db nil modules)))
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/select :model/Card) 'metabase.lib.be.db nil modules))))
    (testing "a db namespace under a directory naming no module is still a finding"
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/query {:select [:*]}) 'metabase.queries.models.db nil modules)))
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/query {:select [:*]}) 'metabase.metabot.llm.models.db nil modules))))
    (testing "enterprise modules resolve through the metabase-enterprise root"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase-enterprise.sandbox.db nil modules))))))

(deftest ^:parallel unmarked-value-in-a-db-namespace-test
  (testing "a symbol reaching a value slot is flagged"
    (is (=? [{:type    :metabase/unsafe-app-db-query
              :message #"`locale` reaches a SQL value slot unmarked.*"}]
            (lint-query-call '(t2/select :model/X {:where [:= :locale locale]}) 'metabase.foo.db))))
  (testing "a marked value is not flagged"
    (is (empty? (lint-query-call '(t2/select :model/X {:where [:= :locale [:auto/param locale]]})
                                 'metabase.foo.db))))
  (testing "a literal cannot carry a request value and is not flagged"
    (is (empty? (lint-query-call '(t2/select :model/X {:where [:= :locale "de"]}) 'metabase.foo.db))))
  (testing "a column reference is not a value"
    (is (empty? (lint-query-call '(t2/select :model/X {:where [:= :a.id :b.id]}) 'metabase.foo.db))))
  (testing "values nested under a boolean connective are reached"
    (is (=? [{:message #"`b`.*"}]
            (lint-query-call '(t2/select :model/X {:where [:and [:= :x [:auto/param a]] [:= :y b]]})
                             'metabase.foo.db))))
  (testing "only db namespaces are linted for unmarked values"
    (is (empty? (filter #(= :metabase/unsafe-app-db-query (:type %))
                        (lint-query-call '(t2/select :model/X {:where [:= :locale locale]})
                                         'metabase.foo.models.thing)))))
  (testing "a test source tree is exempt"
    (is (empty? (lint-query-call '(t2/select :model/X {:where [:= :locale locale]})
                                 'metabase.foo.db "test/metabase/foo/db_test.clj")))))

(deftest ^:parallel kv-arg-style-is-not-flagged-test
  (testing "call style is not linted: a query written as :column value pairs is left alone"
    ;; Extraction to a .sql file is semantic rather than a transcription of the HoneySQL shape, so a
    ;; query map is no closer to that target than kv-args are. Converting also skips Toucan's type
    ;; transforms, which only run in kv-arg position -- that bug shipped twice.
    (are [form] (empty? (filter #(re-find #"Pass this query a map" (str (:message %)))
                                (lint-query-call form 'metabase.foo.db)))
      '(t2/select :model/X :locale [:auto/param locale])
      '(t2/select :model/X :archived false)
      '(t2/select-one :model/X :id (long id))
      '(t2/select-one-fn :value :model/Setting :key [:auto/param k])
      '(t2/select :model/X {:where [:= :locale [:auto/param locale]]})))
  (testing "an unmarked value in a kv-arg is still flagged -- only the style check went away"
    (is (=? [{:type :metabase/unsafe-app-db-query, :message #".*reaches a SQL value slot unmarked.*"}]
            (lint-query-call '(t2/select :model/X :locale locale) 'metabase.foo.db)))))

(deftest ^:parallel conditions-map-values-are-linted-test
  (testing "a conditions map -- a shape the sweep leaves in place -- is checked"
    ;; `(t2/update! model {:col v} changes)` filters on v, but it is not a `:where` clause, so
    ;; neither the query-map walker nor the kv-arg walker used to see it. A namespace written this
    ;; way passed the lint vacuously.
    (are [form] (=? [{:type :metabase/unsafe-app-db-query
                      :message #".*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      '(t2/update! :model/X {:key k} {:v 1})
      '(t2/delete! :model/X {:key k})
      '(t2/update! :model/X {:key [:in ks]} {:v 1})))
  (testing "a marked or coerced conditions value is not flagged"
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/update! :model/X {:key [:auto/param k]} {:v 1})
      '(t2/update! :model/X {:id (long id)} {:v 1})))
  (testing "only the map right after the model is conditions -- the changes map is exempt"
    ;; rule 1: a written value must arrive as itself, so it is never flagged.
    (is (empty? (lint-query-call '(t2/update! :model/X {:id (long id)} {:v written})
                                 'metabase.foo.db)))))

(deftest ^:parallel subquery-values-are-linted-test
  (testing "a value inside a subquery in a value slot is reached"
    (is (=? [{:type :metabase/unsafe-app-db-query
              :message #".*`z`.*reaches a SQL value slot unmarked.*"}]
            (lint-query-call
             '(t2/select :model/X {:where [:in :id {:select [:id] :from [:y] :where [:= :z z]}]})
             'metabase.foo.db))))
  (testing "the plain token case still works -- descending must not replace it"
    (is (=? [{:message #"`v`.*reaches a SQL value slot unmarked.*"}]
            (lint-query-call '(t2/select :model/X {:where [:= :k v]}) 'metabase.foo.db)))))

(deftest ^:parallel conditionally-built-clause-test
  (testing "a value slot inside a conditional form is still reached"
    ;; `value-nodes` used to stop at a list node, so anything a `when`/`if`/`cond->` built was
    ;; invisible -- a false negative in a security lint. permissions/db.clj and collections/db.clj
    ;; both build clauses this way.
    (are [form] (=? [{:type :metabase/unsafe-app-db-query
                      :message #".*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X {:where [:and (when k [:= :key k])]})))
  (testing "both branches of an if are reached"
    (is (= 2 (count (lint-query-call
                     '(t2/select :model/X {:where [:and (if flag [:= :key k] [:= :key other-k])]})
                     'metabase.foo.db)))))
  (testing "a marked value inside a conditional form is not flagged"
    (is (empty? (lint-query-call
                 '(t2/select :model/X {:where [:and (when k [:= :key [:auto/param k]])]})
                 'metabase.foo.db)))))

(deftest ^:parallel kv-arg-values-are-linted-test
  (testing "an unmarked value in a kv-arg pair is flagged, so dropping the style check left no gap"
    (are [form] (=? [{:type :metabase/unsafe-app-db-query
                      :message #".*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X :locale locale)
      '(t2/select-one :model/X :id id)
      ;; the pairs do not start at a fixed offset -- :value comes before the model here
      '(t2/select-one-fn :value :model/Setting :key k)
      ;; a value inside an operator form is reached, rather than the form being treated as a value
      '(t2/select :model/X :id [:in ids])))
  (testing "a marked or coerced kv-arg value is not flagged"
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X :locale [:auto/param locale])
      '(t2/select-one :model/X :id (long id))
      '(t2/select :model/X :id [:in (mapv long ids)])
      '(t2/select :model/X :id [:in [:auto/param ids]])))
  (testing "a literal kv-arg value is not flagged"
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X :archived false)
      '(t2/select :model/X :status "pending")
      '(t2/select :model/X :engine :appdb)))
  (testing "one unmarked value per pair is reported"
    (is (= 2 (count (lint-query-call '(t2/select :model/X :locale locale :msgid msgid)
                                     'metabase.foo.db)))))
  (testing "a call mixing kv-args with a trailing query map reports each value exactly once"
    ;; The two walkers run over the same arguments, so this pins that they do not double-report.
    (is (= 2 (count (lint-query-call
                     '(t2/select :model/X :locale locale {:where [:= :other other]})
                     'metabase.foo.db))))))

(deftest ^:parallel write-calls-are-not-linted-for-values-test
  (testing "an insert's values are written, not filtered on, so they are not flagged"
    (are [form] (empty? (filter #(= :metabase/unsafe-app-db-query (:type %))
                                (lint-query-call form 'metabase.foo.db)))
      '(t2/insert! :model/X :key k :value v)
      '(t2/insert-returning-instances! :model/X :key k :value v)))
  (testing "a select's values are still flagged"
    (is (=? [{:type :metabase/unsafe-app-db-query}]
            (lint-query-call '(t2/select :model/X :key k) 'metabase.foo.db)))))

(deftest ^:parallel operator-arity-test
  (testing "a value operator with an unexpected arity still has its args examined"
    (is (seq (lint-query-call '(t2/select :model/X {:where [:= :a b c]}) 'metabase.foo.db)))
    (is (seq (lint-query-call '(t2/select :model/X {:where [:between :a lo hi]}) 'metabase.foo.db)))))

(deftest ^:parallel operator-coverage-test
  (testing "comparison operators HoneySQL accepts as aliases for not= are checked"
    ;; The set used to list only `not=`, so `[:!= :col v]` -- live in collections/db.clj -- was
    ;; silently unchecked even though HoneySQL binds it as `<>`.
    (are [form] (=? [{:message #"`v`.*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X {:where [:!= :k v]})
      '(t2/select :model/X {:where [:<> :k v]})
      '(t2/select :model/X {:where [:is-distinct-from :k v]})))
  (testing "a two-value operator reports both values"
    (is (= 2 (count (lint-query-call '(t2/select :model/X {:where [:not-between :k lo hi]})
                                     'metabase.foo.db)))))
  (testing "a value wrapped in a function-call form is reached"
    ;; `[:lower v]` compiles to `LOWER(?)`, so `v` is a real bind slot.
    (are [form] (seq (lint-query-call form 'metabase.foo.db))
      '(t2/select :model/X {:where [:= :k [:lower v]]})
      '(t2/select :model/X {:where [:= :k [:cast v :text]]})
      '(t2/select :model/X :k [:lower v])))
  (testing "values in a literal collection are reached"
    ;; `[:in :k [a b]]` binds each element -- `IN (?, ?)`.
    (is (= 2 (count (lint-query-call '(t2/select :model/X {:where [:in :k [a b]]})
                                     'metabase.foo.db))))))

(deftest ^:parallel no-duplicate-findings-test
  (testing "a multi-arg operator in a kv-arg reports each value exactly once"
    ;; value-nodes misreads `[:between lo hi]` as a clause (lo as column), while
    ;; kv-arg-value-nodes reads it correctly, so the walkers overlap on `hi`. Deduping by source
    ;; position makes that harmless.
    (is (= 2 (count (lint-query-call '(t2/select :model/X :d [:between lo hi]) 'metabase.foo.db))))
    (is (= 2 (count (lint-query-call '(t2/delete! :model/X {:d [:between lo hi]})
                                     'metabase.foo.db)))))
  (testing "a query map passed where conditions go reports each value once"
    ;; `{:where ...}` is a query map that value-nodes already walks; treating it as conditions too
    ;; reported everything twice. Live in mcp/db.clj, metabot/db.clj, testing_api/db.clj.
    (is (= 1 (count (lint-query-call '(t2/delete! :model/X {:where [:= :k k]}) 'metabase.foo.db))))
    (is (= 2 (count (lint-query-call '(t2/update! :model/X {:where [:and [:= :a a] [:= :b b]]} {:v 1})
                                     'metabase.foo.db))))))

(deftest ^:parallel two-arity-update-changes-map-test
  (testing "update!'s lone trailing map is CHANGES, not conditions, so its values are not flagged"
    ;; Toucan's arglist ends in the changes map. remote_sync/db.clj's mark-all-rsos-synced! is this
    ;; shape; flagging `written` would ask for a marker on a written value, which the column's
    ;; `:in` transform stores as data.
    (is (empty? (lint-query-call '(t2/update! :model/X {:v written}) 'metabase.foo.db))))
  (testing "delete! has no changes map, so its lone map is always conditions"
    (is (=? [{:message #"`k`.*"}]
            (lint-query-call '(t2/delete! :model/X {:k k}) 'metabase.foo.db))))
  (testing "update!'s FIRST map is still conditions when a changes map follows"
    (is (=? [{:message #"`k`.*"}]
            (lint-query-call '(t2/update! :model/X {:k k} {:v 1}) 'metabase.foo.db)))))

(deftest ^:parallel identifier-clauses-are-not-value-slots-test
  (testing "a symbol naming a column or a table is not reported"
    ;; `value-guard` refuses a marker in these clauses, so reporting one asks for a fix that throws
    ;; at compile. data_studio/db.clj, task_history/db.clj and permissions/db.clj are written this
    ;; way. `:select` is the exception: index 0 of its entries is an expression, so it has its own
    ;; test in expression-entry-clauses-test.
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/query {:select [:*] :from [[union-query :subquery]]})
      '(t2/query {:select [:*] :from [:t] :order-by [[:sort_key sort-direction]]})
      '(t2/query {:select [:*] :from [:t] :group-by [group-column]})))
  (testing "a value nested inside an identifier clause is still reported"
    (are [form] (=? [{:message #"`v`.*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      ;; a computed projection is a real comparison
      '(t2/query {:select [[[:= :engine v] :is_match]] :from [:t]})
      ;; so is a CASE sort key
      '(t2/query {:select [:*] :from [:t] :order-by [[[:case [:= :a v] 1 :else 2] :asc]]})
      ;; a subquery carries its own where clause
      '(t2/query {:select [:*] :from [[{:select [:*] :from [:u] :where [:= :k v]} :s]]}))))

(deftest ^:parallel expression-entry-clauses-test
  (testing "index 0 of an entry is a value slot, because HoneySQL binds a parameter there"
    ;; `{:select [[[:auto/param "a"] :k]]}` compiles to `SELECT ? AS "K"`, so `value-guard` accepts
    ;; a marker there. Treating the whole clause as names would hide a request value.
    (are [form] (=? [{:type    :metabase/unsafe-app-db-query
                      :message #"`v`.*reaches a SQL value slot unmarked.*"}]
                    (lint-query-call form 'metabase.foo.db))
      '(t2/query {:select [[v :label]] :from [:t]})
      '(t2/query {:select-distinct [[v :label]] :from [:t]})
      '(t2/query {:insert-into [:t] :returning [[v :label]]})))
  (testing "the alias, a bare entry and a table entry are names"
    ;; `value-guard` refuses a marker in each of these, so asking for one would break the query.
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/query {:select [[:key alias-sym]] :from [:t]})
      '(t2/query {:select [cols] :from [:t]})
      '(t2/query {:select [:*] :from [[tbl :x]]})))
  (testing "a computed projection and a subquery entry still reach their values"
    (are [form] (=? [{:message #"`v`.*"}] (lint-query-call form 'metabase.foo.db))
      '(t2/query {:select [[[:= :engine v] :is_match]] :from [:t]})
      '(t2/query {:select [:*] :from [[{:select [:*] :from [:u] :where [:= :k v]} :s]]}))))

(deftest ^:parallel clause-context-survives-assoc-test
  (testing "a clause key in an assoc call gives its value the clause context back"
    ;; task_history/db.clj:174 and five other namespaces build `:order-by` this way. Without this
    ;; the lint asks for a marker on a column name and on a sort direction, and the fix the message
    ;; names loses the ordering with no error.
    (are [form] (empty? (lint-query-call form 'metabase.foo.db))
      '(t2/query (assoc q :order-by [[sort-column sort-direction] [:id :desc]]))
      '(t2/query (cond-> q flag (assoc :order-by [[sort-column sort-direction]])))
      '(t2/query (assoc q :group-by [group-column]))
      '(t2/query (assoc q :select [[:key alias-sym]]))))
  (testing "a value clause built the same way is still reported"
    (is (=? [{:message #"`v`.*"}]
            (lint-query-call '(t2/query (assoc q :where [:= :k v])) 'metabase.foo.db))))
  (testing "an expression entry built the same way is still reported"
    (is (=? [{:message #"`v`.*"}]
            (lint-query-call '(t2/query (assoc q :select [[v :label]])) 'metabase.foo.db)))))
