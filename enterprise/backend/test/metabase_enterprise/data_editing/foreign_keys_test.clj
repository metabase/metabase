(ns metabase-enterprise.data-editing.foreign-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.foreign-keys :as fks]))

(deftest take-with-sentinel-test
  (is (= [0 1 2]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 3))))
  (is (= [0 1 2 3]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 4))))
  (is (= [0 1 2 3 :truncated]
         (sequence (fks/take-with-sentinel 4 :truncated) (range 5)))))

(def metadata
  {:orders     [{:table :order-items, :fk {:order-id :id}, :pk [:id]}]

   ;; family tree

   :people     [{:table :people, :fk {:father_id :id}, :pk [:id]}
                {:table :people, :fk {:mother_id :id}, :pk [:id]}]

   ;; project tracker

   :users      [{:table :teams, :fk {:belongs-to :id}, :pk [:id]}
                {:table :users, :fk {:reports-to :id}, :pk [:id]}
                {:table :programmes, :fk {:guided-by :id}, :pk [:id]}]

   :teams      [{:table :users, :fk {:managed-by :id}, :pk [:id]}
                {:table :programmes, :fk {:focus :id}, :pk [:id]}]

   :programmes [{:table :projects, :fk {:part-of :id}, :pk [:id]}]

   :projects   [{:table :tasks, :fk {:project :id} :pk [:id]}]

   :tasks      [{:table :users, :fk {:assigned-to :id}, :pk [:id]}]})

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
                 {:id :user/pm, :belongs-to :team/alpha}
                 {:id :user/alice, :belongs-to :team/alpha}
                 {:id :user/bob, :belongs-to :team/alpha}
                 {:id :user/clarence, :belongs-to :team/alpha}]

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
  (is (= {:order-items #{{:id 1338} {:id 1337}}}
         (fks/walk :orders [{:id 42}] metadata lookup-children)))
  (is (= {:people #{{:id 5} {:id 4} {:id 3}}}
         (fks/walk :people [{:id 1}] metadata lookup-children)))
  (is (= {:users      #{{:id :user/ceo}
                        {:id :user/cto}
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
          :tasks      #{{:id :task/foo}}}
         (fks/walk :users [{:user/ceo 1}] metadata lookup-children))))
