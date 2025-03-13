(ns metabase-enterprise.data-editing.foreign-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.foreign-keys :as fks]))

(def ^:private metadata
  {:orders     [{:table :order-items, :fk {:order-id :id}, :pk [:id]}]

   ;; family tree

   :people     [{:table :people, :fk {:father_id :id}, :pk [:id]}
                {:table :people, :fk {:mother_id :id}, :pk [:id]}]

   ;; project tracker

   :users      [{:table :teams, :fk {:managed-by :id}, :pk [:id]}
                {:table :users, :fk {:reports-to :id}, :pk [:id]}
                {:table :programmes, :fk {:guided-by :id}, :pk [:id]}
                {:table :tasks, :fk {:assigned-to :id}, :pk [:id]}]

   :teams      [{:table :users, :fk {:member-of :id}, :pk [:id]}]

   :programmes [{:table :projects, :fk {:part-of :id}, :pk [:id]}
                {:table :teams, :fk {:focus :id}, :pk [:id]}]

   :projects   [{:table :tasks, :fk {:project :id} :pk [:id]}]})

(def db
  {:orders      [{:id 42}
                 {:id 43}]
   :order-items [{:id 1337, :order-id 42}
                 {:id 1338, :order-id 42}
                 {:id 1339, :order-id 43}]

   ;; family tree

   :people      [{:id 1}
                 {:id 2}
                 {:id 3 :father_id 1 :mother_id 2}
                 {:id 4 :father_id 1 :mother_id 3}
                 {:id 5 :father_id nil :mother_id 3}]

   ;; project tracker

   :users       [{:id :user/ceo}
                 {:id :user/cto, :reports-to :user/ceo}
                 {:id :user/cpo, :reports-to :user/ceo}
                 {:id :user/em, :reports-to :user/cto, :belongs-to :team/alpha}
                 {:id :user/pm, :member-of :team/alpha}
                 {:id :user/alice, :member-of :team/alpha}
                 {:id :user/bob, :member-of :team/alpha}
                 {:id :user/clarence, :member-of :team/alpha}]

   :teams       [{:id :team/alpha, :managed-by :user/em, :focus :programme/skunk-works}
                 {:id :team/bravo, :managed-by :user/cto}]

   :programmes  [{:id :programme/skunk-works, :guided-by :user/cpo}]

   :projects    [{:id :project/gamma, :part-of :programme/skunk-works}]

   :tasks       [{:id :task/foo, :project :project/gamma, :assigned-to :user/alice}]})

(defn matches? [parent fks child]
  (= (map parent (vals fks))
     (map child (keys fks))))

(defn lookup-children
  ([relationship parents]
   (lookup-children db relationship parents))
  ([db {:keys [table fk pk]} parents]
   [table
    (for [child  (get db table)
          parent parents
          :when (matches? parent fk child)]
      (select-keys child pk))]))

(deftest walk-test
  (is (= {:complete? true
          :items     {:order-items #{{:id 1338} {:id 1337}}}}
         (fks/walk :orders [{:id 42}] metadata lookup-children)))
  (is (= {:complete? true
          :items     {:people #{{:id 5} {:id 4} {:id 3}}}}
         (fks/walk :people [{:id 1}] metadata lookup-children)))
  (is (= {:complete? true
          :items     {:users      #{{:id :user/cto}
                                    {:id :user/cpo}
                                    {:id :user/em}
                                    {:id :user/pm}
                                    {:id :user/bob}
                                    {:id :user/clarence}
                                    {:id :user/alice}}
                      :teams      #{{:id :team/alpha}
                                    {:id :team/bravo}}
                      :programmes #{{:id :programme/skunk-works}}
                      :projects   #{{:id :project/gamma}}
                      :tasks      #{{:id :task/foo}}}}
         (fks/walk :users [{:id :user/ceo}] metadata lookup-children))))

(deftest count-descendants-test
  (is (= {:complete? true
          :counts    {:order-items 2}}
         (fks/count-descendants :orders [{:id 42}] metadata lookup-children)))
  (is (= {:complete? true
          :counts    {:people 3}}
         (fks/count-descendants :people [{:id 1}] metadata lookup-children)))
  (is (= {:complete? true
          :counts    {:users      7
                      :teams      2
                      :programmes 1
                      :projects   1
                      :tasks      1}}
         (fks/count-descendants :users [{:id :user/ceo}] metadata lookup-children))))

(defn- delete-items [db items]
  (reduce
   (fn [db [item-type items]]
     (update db item-type (fn [existing]
                            (filterv #(not (items (select-keys % (keys (first items)))))
                                     existing))))
   db
   items))

(defn- after-delete [table rows]
  (let [*db       (atom db)
        lookup-fn #(apply lookup-children @*db %&)
        delete-fn #(swap! *db delete-items %)]
    (fks/delete-recursively table rows metadata lookup-fn delete-fn)
    (select-keys @*db
                 (case table
                   :orders [:orders :order-items]
                   :people [:people]
                   :users  (remove #{:orders :order-items :people} (keys db))))))

(deftest delete-recursively-test
  (is (= {:orders [{:id 43}], :order-items [{:id 1339, :order-id 43}]}
         (after-delete :orders [{:id 42}])))

  (is (= {:people [{:id 2}]}
         (after-delete :people [{:id 1}])))

  (is (= {:programmes [], :projects [], :tasks [], :teams [], :users []}
         (after-delete :users [{:id :user/ceo}])))
  (is (= {:users      [{:id :user/ceo}
                       {:id :user/cto, :reports-to :user/ceo}
                       {:id :user/cpo, :reports-to :user/ceo}]
          :teams      [{:id :team/bravo, :managed-by :user/cto}],
          :programmes [{:guided-by :user/cpo, :id :programme/skunk-works}],
          :projects   [{:id :project/gamma, :part-of :programme/skunk-works}],
          :tasks      []}
         (after-delete :users [{:id :user/em}]))))
