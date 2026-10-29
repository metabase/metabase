(ns hooks.metabase.toucan.db-ns-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.test :refer :all]
   [hooks.metabase.toucan.db-ns :as toucan.db-ns]))

(defn- lint-query-call [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/t2-implicit-pk {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (let [input  {:node     (hooks/parse-string (pr-str form))
                  :ns       'metabase.foo.bar
                  :filename "src/metabase/foo/bar.clj"}
          output (toucan.db-ns/lint-query-call input)]
      (is (identical? (:node input) (:node output))
          "the hook must return the node unchanged so Kondo's normal analysis still runs")
      @(:findings clj-kondo.impl.utils/*ctx*))))

(defn- implicit-pk-findings [form]
  (filter #(= :metabase/t2-implicit-pk (:type %))
          (lint-query-call form)))

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
    (is (=? [{:message #".*`:table_id table-id`.*"}]
            (implicit-pk-findings '(t2/update! :model/TableUserSettings table-id {:x 1}))))
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
