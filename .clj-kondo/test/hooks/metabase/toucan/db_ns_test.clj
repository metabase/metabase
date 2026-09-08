(ns hooks.metabase.toucan.db-ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]))

(defn- lint-query-call
  "Run the hook over `form` as if it appeared in `ns-sym`. `:modules` is the `:metabase/modules` map the module
  linter would supply; without it the hook falls back to single-segment resolution, which is what a repo with no
  nested modules declared looks like."
  [form ns-sym & {:keys [filename modules]}]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/t2-query-namespace {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (let [input  {:node     (hooks/parse-string (pr-str form))
                  :ns       ns-sym
                  :filename (or filename "src/metabase/foo/bar.clj")
                  :config   (when modules {:metabase/modules modules})}
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
                                 :filename "test/metabase/sso/test_helpers.clj")))
    (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase-enterprise.remote-sync.test-helpers
                                 :filename "/repo/enterprise/backend/test/metabase_enterprise/remote_sync/test_helpers.clj"))))
  (testing "app-db wrappers around Toucan 2 are reported the same way"
    (is (=? [{:type    :metabase/t2-query-namespace
              :message #".*`mdb/update-or-insert!`.*"}]
            (lint-query-call '(mdb/update-or-insert! :model/Foo {:id 1}) 'metabase.foo.models.foo))))
  (testing "fully-qualified calls are reported by their written name"
    (is (=? [{:type    :metabase/t2-query-namespace
              :message #".*`toucan2.core/insert!`.*"}]
            (lint-query-call '(toucan2.core/insert! :model/Card {}) 'metabase.queries.models.card)))))

(deftest ^:parallel t2-query-namespace-follows-the-module-tree-test
  (let [modules '{queries      {}
                  metabot      {}
                  metabot.llm  {}
                  lib.be       {:ns-prefix "metabase.lib-be"}
                  enterprise/sandbox {}}]
    (testing "a nested module owns its own db namespace"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.metabot.llm.db :modules modules))))
    (testing "the parent's db namespace stays its own"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.metabot.db :modules modules))))
    (testing "a module with an explicit :ns-prefix is resolved through it, not through its dotted name"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase.lib-be.db :modules modules)))
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/select :model/Card) 'metabase.lib.be.db :modules modules))))
    (testing "a db namespace under a directory that names no module is still a finding"
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/query {:select [:*]}) 'metabase.queries.models.db :modules modules)))
      (is (=? [{:type :metabase/t2-query-namespace}]
              (lint-query-call '(t2/query {:select [:*]}) 'metabase.metabot.llm.models.db :modules modules))))
    (testing "enterprise modules resolve through the metabase-enterprise root"
      (is (empty? (lint-query-call '(t2/select :model/Card) 'metabase-enterprise.sandbox.db :modules modules))))))
