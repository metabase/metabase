(ns metabase.models.dependency-test
  (:require [expectations :refer :all]
            [metabase.models.dependency :refer :all]
            [metabase.test.data :refer :all]
            [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan
             [db :as db]
             [models :as models]]
            [toucan.util.test :as tt]))

(models/defmodel ^:private Mock :mock)

(extend (class Mock)
  IDependent
  {:dependencies (fn [_ id instance]
                   {:a [1 2]
                    :b [3 4 5]})})


;; IDependent/dependencies

(expect
  {:a [1 2]
   :b [3 4 5]}
  (dependencies Mock 7 {}))


;; helper functions

(defn format-dependencies [deps]
  (->> deps
       (map #(into {} %))
       (map #(dissoc % :id :created_at))
       set))


;; retrieve-dependencies

(expect
  #{{:model              "Mock"
     :model_id           4
     :dependent_on_model "test"
     :dependent_on_id    1}
    {:model              "Mock"
     :model_id           4
     :dependent_on_model "foobar"
     :dependent_on_id    13}}
  (tt/with-temp* [Dependency [_ {:model              "Mock"
                                 :model_id           4
                                 :dependent_on_model "test"
                                 :dependent_on_id    1
                                 :created_at         (du/new-sql-timestamp)}]
                  Dependency [_ {:model              "Mock"
                                 :model_id           4
                                 :dependent_on_model "foobar"
                                 :dependent_on_id    13
                                 :created_at         (du/new-sql-timestamp)}]]
    (format-dependencies (retrieve-dependencies Mock 4))))


;; update-dependencies!

;; we skip over values which aren't integers
(expect
  #{}
  (do
    (update-dependencies! Mock 2 {:test ["a" "b" "c"]})
    (set (db/select Dependency, :model "Mock", :model_id 2))))

;; valid working dependencies list
(expect
  #{{:model              "Mock"
     :model_id           7
     :dependent_on_model "test"
     :dependent_on_id    1}
    {:model              "Mock"
     :model_id           7
     :dependent_on_model "test"
     :dependent_on_id    2}
    {:model              "Mock"
     :model_id           7
     :dependent_on_model "test"
     :dependent_on_id    3}}
  (do
    (update-dependencies! Mock 7 {:test [1 2 3]})
    (format-dependencies (db/select Dependency, :model "Mock", :model_id 7))))

;; delete dependencies that are no longer in the list
(expect
  #{{:model              "Mock"
     :model_id           1
     :dependent_on_model "test"
     :dependent_on_id    1}
    {:model              "Mock"
     :model_id           1
     :dependent_on_model "test"
     :dependent_on_id    2}}
  (do
    (db/insert! Dependency
      :model              "Mock"
      :model_id           1
      :dependent_on_model "test"
      :dependent_on_id    5
      :created_at         (du/new-sql-timestamp))
    (update-dependencies! Mock 1 {:test [1 2]})
    (format-dependencies (db/select Dependency, :model "Mock", :model_id 1))))
