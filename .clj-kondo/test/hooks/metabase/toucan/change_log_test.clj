(ns hooks.metabase.toucan.change-log-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.change-log :as toucan.change-log]))

(defn- raw-write-findings [form & [ns-sym filename]]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/change-log-raw-write {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (let [input  {:node     (hooks/parse-string (pr-str form))
                  :ns       (or ns-sym 'metabase.foo.bar)
                  :filename (or filename "src/metabase/foo/bar.clj")}
          output (toucan.change-log/lint-write input)]
      (is (identical? (:node input) (:node output))
          "the hook must return the node unchanged so Kondo's normal analysis still runs")
      @(:findings clj-kondo.impl.utils/*ctx*))))

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
