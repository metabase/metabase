(ns metabase-enterprise.data-editing.foreign-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.foreign-keys :as fks]))

(deftest descendants->table-counts-test
  (is (= {:tables {:a 2, :b 1}, :complete? false}
         (fks/descendants->table-counts [{:table :a, :row {:id 1}}
                                         {:table :a, :row {:id 2}}
                                         {:table :b, :row {:id 3}}
                                         :fks/item-limit])))

  (is (= {:tables {:a 2, :b 1}, :complete? true}
         (fks/descendants->table-counts [{:table :a, :row {:id 1}}
                                         {:table :a, :row {:id 2}}
                                         {:table :b, :row {:id 3}}]))))

(deftest take-with-sentinel-test
  (is (= [0 1 2]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 3))))
  (is (= [0 1 2 3]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 4))))
  (is (= [0 1 2 3 :truncated]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 5)))))

(def graph
  {:user/ceo              {:reports-to [:user/cto
                                        :user/cpo]}
   :user/cto              {:belongs-to [:team/alpha
                                        :team/bravo]}
   :user/cpo              {:lead-by  [:programme/skunk-works]
                           :managing [:user/pm]}
   :team/alpha            {:member-of [:user/em
                                       :user/alice
                                       :user/bob
                                       :user/clarence]
                           :owned-by  [:programme/skunk-works]}
   :programme/skunk-works {:part-of [:project/gamma]}
   :project/gamma         {:belongs-to [:task/foo]}
   :user/em               {:manages [:team/alpha]}
   :user/alice            {:assigned-to [:task/foo]}})

(defn- bulk-children [xs]
  (let [child-maps (map graph xs)
        ks         (into #{} (mapcat keys) child-maps)]
    (mapv #(constantly (mapcat % child-maps)) ks)))

(defn- kw->row [kw]
  (if (= (namespace ::this-ns) (namespace kw))
    kw
    {:table (keyword (namespace kw))
     :pks   [(keyword (name kw))]}))

(deftest reducible-batch-bfs-test
  (is (= [{:table :user, :pks [:cto]}
          {:table :user, :pks [:cpo]}
          {:table :team, :pks [:alpha]}
          {:table :team, :pks [:bravo]}
          {:table :user, :pks [:pm]}
          {:table :programme, :pks [:skunk-works]}
          ::too-many-queries]
         (into []
               (map kw->row)
               (fks/reducible-batch-bfs bulk-children [:user/ceo]
                                        {:max-chunk-size       4
                                         :max-thunk-executions 5
                                         :max-thunks-sentinel  ::too-many-queries}))))

  (is (= [{:table :user, :pks [:cto]}
          {:table :user, :pks [:cpo]}
          {:table :team, :pks [:alpha]}
          {:table :team, :pks [:bravo]}
          {:table :user, :pks [:pm]}
          {:table :programme, :pks [:skunk-works]}
          {:table :user, :pks [:em]}
          {:table :user, :pks [:alice]}
          {:table :user, :pks [:bob]}
          {:table :user, :pks [:clarence]}
          {:table :project, :pks [:gamma]}
          {:table :task, :pks [:foo]}]
         (into []
               (map kw->row)
               (fks/reducible-batch-bfs bulk-children [:user/ceo]
                                        {:max-thunks-sentinel ::too-many-queries})))))
