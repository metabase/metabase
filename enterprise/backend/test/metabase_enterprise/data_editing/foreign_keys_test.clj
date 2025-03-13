(ns metabase-enterprise.data-editing.foreign-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.foreign-keys :as fks]))

(def metadata
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

(defn lookup-children [relationship parents]
  [(:table relationship)
   (for [child  (get db (:table relationship))
         parent parents
         :when (matches? parent (:fk relationship) child)]
     (select-keys child (:pk relationship)))])

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
          :counts    {:users      8
                      :teams      2
                      :programmes 1
                      :projects   1
                      :tasks      1}}
         (fks/count-descendants :users [{:id :user/ceo}] metadata lookup-children))))

(def ^:private ^:dynamic *db* nil)

(defn- delete-items! [items]
  (swap! *db* (fn [db]
                (reduce
                 (fn [db [item-type items]]
                   (update db item-type (fn [existing]
                                          (filterv #(not (items (select-keys % (keys (first items)))))
                                                   existing))))
                 db
                 #p items))))

(defmacro with-mutable-db [db & body]
  `(binding [*db* (atom ~db)]
     ~@body
     @*db*))

(defn- after-delete [table rows]
  (with-mutable-db db
    (fks/delete-recursively table rows metadata lookup-children delete-items!)))

(deftest delete-recursively-test
  (is (= {:orders [{:id 43}], :order-items [{:id 1339, :order-id 43}]}
         (select-keys (after-delete :orders [{:id 42}])
                      [:orders :order-items])))

  (is (= {:people [{:id 2}]}
         (select-keys (after-delete :people [{:id 1}])
                      [:people])))

  (is (= {:programmes [], :projects [], :tasks [], :teams [], :users []}
         (dissoc (after-delete :users [{:id :user/ceo}])
                 :orders :order-items :people)))
  (is (= {:users      [{:id :user/ceo}
                       {:id :user/cto, :reports-to :user/ceo}
                       {:id :user/cpo, :reports-to :user/ceo}]
          :teams      [{:id :team/bravo, :managed-by :user/cto}],
          :programmes [{:guided-by :user/cpo, :id :programme/skunk-works}],
          :projects   [{:id :project/gamma, :part-of :programme/skunk-works}],
          :tasks      []}
         (dissoc (after-delete :users [{:id :user/em}])
                 :orders :order-items :people))))
