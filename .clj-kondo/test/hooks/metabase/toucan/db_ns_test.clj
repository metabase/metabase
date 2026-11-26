(ns hooks.metabase.toucan.db-ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]))

(defn- confinement-findings
  "Only the `t2-query-namespace` findings, so these tests are not affected by the other linters
  that share this hook."
  [findings]
  (filter #(= :metabase/t2-query-namespace (:type %)) findings))

(defn- lint-query-call [form ns-sym & [filename modules]]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/t2-query-namespace {:level :warning}
                                                               :metabase/t2-implicit-pk       {:level :warning}
                                                               :metabase/change-log-raw-write {:level :warning}
                                                               :metabase/foreign-model-write  {:level :warning}}}
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
    (is (empty? (lint-query-call '(t2/update! :model/User :id 1 {:sso_source nil}) 'metabase.sso.test-helpers
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

(defn- implicit-pk-findings [form]
  (filter #(= :metabase/t2-implicit-pk (:type %))
          (lint-query-call form 'metabase.foo.db)))

(deftest ^:parallel t2-implicit-pk-test
  (testing "a bare primary key is reported, wherever the model sits in the arglist"
    (are [form] (=? [{:message #"Pass the primary key as `:id id`.*"}] (implicit-pk-findings form))
      '(t2/select-one :model/Card id)
      '(t2/select :model/Card id)
      '(t2/select-one [:model/Card :name] id)
      '(t2/exists? :model/Card id)
      '(t2/count :model/Card id)
      '(t2/delete! :model/Card id)
      '(t2/update! :model/Card id {:name "x"})
      '(t2/select-one-fn :name :model/Card id)
      '(t2/select-fn-set :name :model/Card id)
      '(t2/select-fn->fn :id :name :model/Card id)
      '(toucan2.core/select-one :model/Card id)))
  (testing "a number or a call is a primary key too"
    (is (=? [{:message #".*`:id 1`.*"}] (implicit-pk-findings '(t2/select-one :model/Card 1))))
    (is (=? [{:message #".*`:id \(query-id q\)`.*"}]
            (implicit-pk-findings '(t2/select-one :model/Card (query-id q)))))
    (is (=? [{:message #".*`:id \(u/the-id card\)`.*"}]
            (implicit-pk-findings '(t2/select-one :model/Card (u/the-id card))))))
  (testing "a model whose primary key is not :id gets its own column in the message"
    (is (=? [{:message #".*`:key setting-key`.*"}]
            (implicit-pk-findings '(t2/update! :model/Setting setting-key {:x 1}))))
    (is (=? [{:message #".*`:action_id action-id`.*"}]
            (implicit-pk-findings '(t2/select-one :model/QueryAction action-id)))))
  (testing "a model that is not a literal keyword gets :toucan/pk, which matches on that model's own primary key"
    (is (=? [{:message #".*`:toucan/pk id`.*"}] (implicit-pk-findings '(t2/delete! model id))))
    (is (=? [{:message #".*`:toucan/pk pk`.*"}] (implicit-pk-findings '(t2/update! (:model entity) pk changes)))))
  (testing "a value that could be a string is reported, since Toucan reads a bare string as a query"
    (are [form] (=? [{:type :metabase/t2-implicit-pk}] (implicit-pk-findings form))
      '(t2/select :model/Card (str "SELECT * FROM report_card WHERE name = '" n "'"))
      ;; a fn named for a query could still return SQL
      '(t2/select :metadata/table (metadata-where :metadata/table db-id spec))
      '(t2/select :model/Exploration (my-explorations-query user-id limit offset))
      ;; threaded or branching forms return a map only when every way out of them is one
      '(t2/select :model/Card (cond-> q flag (assoc :where w)))
      '(t2/select :model/Card (-> (base-query) (sql.helpers/where w)))
      '(t2/count :model/Card (or (run-where filters) {}))
      '(t2/select :model/Card (if flag {:where w} q))
      '(t2/select :model/Card (merge base extra))
      ;; only the real `h2x/assert-map-or-nil!` counts, not any fn of that name
      '(t2/select :model/Card (my.ns/assert-map-or-nil! q))
      ;; a map literal inside a call is no proof the call returns a map
      '(t2/select-one :model/Card (t2/insert-returning-pk! :model/Card {:name "x"}))))
  (testing "an explicit primary key, or a query written in place, is fine"
    (are [form] (empty? (implicit-pk-findings form))
      '(t2/select-one :model/Card :id id)
      '(t2/select-one :model/Card :toucan/pk id)
      '(t2/select-one :model/Card)
      '(t2/select :model/Card {:where [:= :id id]})
      '(t2/select :model/Card :named-query)
      '(t2/select :model/Card "SELECT * FROM report_card")
      '(t2/select :model/Card ["SELECT * FROM report_card WHERE id = ?" id])
      '(t2/select :model/Card nil)
      '(t2/select :model/Card (t2.identity-query/identity-query rows))
      ;; `h2x/assert-map-or-nil!` throws for anything but a map, so its result can't be a string
      '(t2/select :metadata/table (metabase.util.honey-sql-2/assert-map-or-nil! (metadata-where :metadata/table db-id spec)))
      '(t2/update! :model/X (metabase.util.honey-sql-2/assert-map-or-nil! conditions) {:x 1})
      ;; forms that can only yield a map
      '(t2/select :model/Card (cond-> {} where (assoc :where where)))
      '(t2/select :model/Card (m/assoc-some {} :where where))
      '(t2/select :model/Card (assoc q :limit 1))
      '(t2/update! :model/Session (cond-> (assoc conditions :ended_at nil) flag (update :id f)) {:x 1})
      '(t2/select :model/Card (merge base {:limit 1}))
      '(t2/select :model/Card (if flag {:where w} {}))
      '(t2/select :model/Card (when flag {:where w}))
      '(t2/update! :model/Card {:name "x"})
      '(t2/update! :model/Card :id id {:name "x"})
      '(t2/update! :model/Card {:collection_id coll-id} {:name "x"})
      '(t2/insert! :model/Card card)
      '(t2/select-one-fn :name :model/Card :id id))))

(defn- raw-write-findings [form & [ns-sym filename]]
  (filter #(= :metabase/change-log-raw-write (:type %))
          (lint-query-call form (or ns-sym 'metabase.foo.db) filename)))

(deftest ^:parallel change-log-raw-write-test
  (testing "a write to the table of a tracked model is reported"
    (are [form] (=? [{:message #"This write skips the model.*"}] (raw-write-findings form))
      '(t2/update! (t2/table-name :model/Card) :id id {:name "x"})
      '(t2/delete! (t2/table-name :model/PulseChannelRecipient) :pulse_channel_id id)
      '(t2/insert! :report_card {:name "x"})
      '(t2/insert-returning-pk! (t2/table-name :model/User) user)
      '(t2/query {:update :tenant, :set {:is_active false}})
      '(t2/query-one {:update (t2/table-name :model/Field), :set {:active false}, :where where})
      '(t2/query {:update [(t2/table-name :model/Card)], :set {:name "x"}})
      '(t2/reducible-query {:delete-from (t2/table-name :model/Card), :where where, :returning [:id]})
      '(t2/query-one {:insert-into [[:permissions_group_membership [:group_id :user_id]] subquery]})
      '(mdb/query {:delete-from [:core_user :u], :where where})))
  (testing "a write to the table of a model in a variable is reported"
    (are [form] (=? [{:type :metabase/change-log-raw-write}] (raw-write-findings form))
      '(t2/query {:update (t2/table-name model), :set {:view_count 1}})
      '(t2/delete! (t2/table-name (:model entity)) :id id)))
  (testing "a write through the model, or to a table that is not tracked, is fine"
    (are [form] (empty? (raw-write-findings form))
      '(t2/update! :model/Card :id id {:name "x"})
      '(t2/delete! model :id id)
      '(t2/insert! table rows)
      '(t2/delete! (t2/table-name :model/Setting) :key k)
      '(t2/insert! (t2/table-name (t2/resolve-model :model/Setting)) row)
      '(t2/insert! :search_index rows)
      '(t2/query {:update :setting, :set {:value v}})
      '(t2/query {:update (t2/table-name :model/Session), :set {:ended_at now}})))
  (testing "a read of a tracked table is fine"
    (are [form] (empty? (raw-write-findings form))
      '(t2/query {:select [:id], :from [(t2/table-name :model/Card)]})
      '(t2/select (t2/table-name :model/Card) :id id)
      '(t2/query {:select [:id], :from [:report_card]})))
  (testing "tests and migrations are not checked"
    (is (empty? (raw-write-findings '(t2/insert! :report_card card) 'metabase.foo-test "test/metabase/foo_test.clj")))
    (is (empty? (raw-write-findings '(t2/insert! :report_card card) 'metabase.app-db.custom-migrations)))
    (is (empty? (raw-write-findings '(t2/insert! :report_card card) 'metabase.app-db.custom-migrations.metrics-v2)))))

(defn- foreign-write-findings
  "Only the `foreign-model-write` findings of linting `form` in `ns-sym` against a small module tree."
  [form ns-sym & [filename]]
  (filter #(= :metabase/foreign-model-write (:type %))
          (lint-query-call form ns-sym filename '{queries                {:model-exports #{:model/Card}}
                                                  queries.rest           {:ns-prefix "metabase.queries-rest"}
                                                  dashboards             {:model-exports #{:model/Dashboard}}
                                                  enterprise/dashboards  {}
                                                  app-db                 {}})))

(deftest ^:parallel foreign-model-write-test
  (testing "a write of a model another module owns is flagged"
    (are [form] (=? [{:type :metabase/foreign-model-write, :message #".*:model/Card belongs to module queries.*"}]
                    (foreign-write-findings form 'metabase.dashboards.db))
      '(t2/insert! :model/Card {:name "x"})
      '(t2/insert-returning-instances! :model/Card rows)
      '(t2/update! :model/Card :id id {:name "x"})
      '(t2/delete! :model/Card :id id)))
  (testing "a write of the module's own model, or from a descendant of its owner, is fine"
    (is (empty? (foreign-write-findings '(t2/update! :model/Dashboard :id id {:name "x"}) 'metabase.dashboards.db)))
    (is (empty? (foreign-write-findings '(t2/update! :model/Card :id id {:name "x"}) 'metabase.queries-rest.db)))
    (is (empty? (foreign-write-findings '(t2/update! :model/Dashboard :id id {:name "x"}) 'metabase-enterprise.dashboards.db))))
  (testing "a read, a model that is not a literal, and a model no module exports are not checked"
    (is (empty? (foreign-write-findings '(t2/select :model/Card :id id) 'metabase.dashboards.db)))
    (is (empty? (foreign-write-findings '(t2/delete! model :id id) 'metabase.dashboards.db)))
    (is (empty? (foreign-write-findings '(t2/delete! :model/Unexported :id id) 'metabase.dashboards.db))))
  (testing "tests and the app-db module are not checked"
    (is (empty? (foreign-write-findings '(t2/insert! :model/Card card) 'metabase.dashboards.foo-test "test/metabase/dashboards/foo_test.clj")))
    (is (empty? (foreign-write-findings '(t2/insert! :model/Card card) 'metabase.app-db.custom-migrations)))))
