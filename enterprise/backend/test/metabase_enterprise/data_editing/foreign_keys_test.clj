(ns metabase-enterprise.data-editing.foreign-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.foreign-keys :as fks]
   [metabase-enterprise.data-editing.foreign-keys2 :as fks2]))

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
                                        :team/bravo]
                           :reports-to [:team/em]}
   :user/cpo              {:lead-by    [:programme/skunk-works]
                           :reports-to [:user/pm]}
   :team/alpha            {:member-of [:user/em
                                       :user/alice
                                       :user/bob
                                       :user/clarence]
                           :owned-by  [:programme/skunk-works]}
   :programme/skunk-works {:part-of [:project/gamma]}
   :project/gamma         {:belongs-to [:task/foo]}
   :user/em               {:managed-by [:team/alpha]}
   :user/alice            {:assigned-to [:task/foo]}})

(def metadata {:orders [{:table :order-items, :fk {:order-id :id}, :pk [:id]}]
               :people [{:table :people, :fk {:father :id}, :pk [:id]}
                        {:table :people, :fk {:mother :id}, :pk [:id]}]})

(def db
  {:orders      [{:id 42}
                 {:id 43}]
   :order-items [{:id 1337, :order-id 42}
                 {:id 1338, :order-id 42}
                 {:id 1339, :order-id 43}]
   :people      [{:id 1}
                 {:id 2}
                 {:id 3 :father 1 :mother 2}
                 {:id 4 :father 1 :mother 3}
                 ;; it's a scandal, nobody knows
                 {:id 5 :father nil :mother 3}]})

(deftest walk-test
  (fks2/walk :orders [{:id 42}] metadata)
  (fks2/walk :people [{:id 1}] metadata))
