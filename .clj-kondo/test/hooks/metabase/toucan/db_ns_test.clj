(ns hooks.metabase.toucan.db-ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]))

(defn- lint-query-call [form ns-sym & [filename modules]]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/t2-query-namespace {:level :warning}
                                                               :metabase/unmarked-sql-value  {:level :warning}}}
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
    (is (empty? (lint-query-call '(t2/select-one :model/Card :id 1) 'metabase.queries.db))))
  (testing "metabase-enterprise.<module>.db is allowed"
    (is (empty? (lint-query-call '(t2/select-one :model/Card :id 1) 'metabase-enterprise.sandbox.db))))
  (testing "metabase.driver.<driver>.db is allowed for driver modules"
    (is (empty? (lint-query-call '(t2/select-one :model/Database :id 1) 'metabase.driver.bigquery-cloud-sdk.db))))
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
    (is (=? [{:type    :metabase/unmarked-sql-value
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
    (is (empty? (filter #(= :metabase/unmarked-sql-value (:type %))
                        (lint-query-call '(t2/select :model/X {:where [:= :locale locale]})
                                         'metabase.foo.models.thing)))))
  (testing "a test source tree is exempt"
    (is (empty? (lint-query-call '(t2/select :model/X {:where [:= :locale locale]})
                                 'metabase.foo.db "test/metabase/foo/db_test.clj")))))

(deftest ^:parallel unmarked-kv-arg-value-test
  (testing "a symbol passed as a kv-arg value is flagged"
    (is (=? [{:type    :metabase/unmarked-sql-value
              :message #"`locale` reaches a SQL value slot unmarked.*"}]
            (lint-query-call '(t2/select :model/X :locale locale) 'metabase.foo.db))))
  (testing "a marked kv-arg is not flagged"
    (is (empty? (lint-query-call '(t2/select :model/X :locale [:auto/param locale]) 'metabase.foo.db))))
  (testing "a coerced kv-arg is not flagged"
    (is (empty? (lint-query-call '(t2/select-one :model/X :id (long id)) 'metabase.foo.db))))
  (testing "a literal kv-arg is not flagged"
    (is (empty? (lint-query-call '(t2/select :model/X :archived false) 'metabase.foo.db))))
  (testing "each unmarked pair is reported"
    (is (= 2 (count (lint-query-call '(t2/select :model/X :locale locale :msgid msgid)
                                     'metabase.foo.db))))))

(deftest ^:parallel kv-arg-offset-test
  (testing "a fn with an argument before the model still pairs its kv-args correctly"
    (is (=? [{:message #"`k`.*"}]
            (lint-query-call '(t2/select-one-fn :value :model/Setting :key k) 'metabase.foo.db)))
    (is (=? [{:message #"`uid`.*"}]
            (lint-query-call '(t2/select-fn-set :group_id :model/X :user_id uid) 'metabase.foo.db)))))

(deftest ^:parallel write-calls-are-not-linted-for-values-test
  (testing "an insert's values are written, not filtered on, so they are not flagged"
    (are [form] (empty? (filter #(= :metabase/unmarked-sql-value (:type %))
                                (lint-query-call form 'metabase.foo.db)))
      '(t2/insert! :model/X :key k :value v)
      '(t2/insert-returning-instances! :model/X :key k :value v)))
  (testing "a select's values are still flagged"
    (is (=? [{:type :metabase/unmarked-sql-value}]
            (lint-query-call '(t2/select :model/X :key k) 'metabase.foo.db)))))

(deftest ^:parallel operator-arity-test
  (testing "a value operator with an unexpected arity still has its args examined"
    (is (seq (lint-query-call '(t2/select :model/X {:where [:= :a b c]}) 'metabase.foo.db)))
    (is (seq (lint-query-call '(t2/select :model/X {:where [:between :a lo hi]}) 'metabase.foo.db)))))
