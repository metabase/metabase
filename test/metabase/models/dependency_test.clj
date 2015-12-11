(ns metabase.models.dependency-test
  (:require [expectations :refer :all]
            [korma.core :as k]
            [metabase.db :as db]
            (metabase.models [dependency :refer :all]
                             [interface :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(defentity Mock [(k/table :mock)])

(extend MockEntity
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
  (tu/with-temp Dependency [_ {:model              "Mock"
                               :model_id           4
                               :dependent_on_model "test"
                               :dependent_on_id    1
                               :created_at         (u/new-sql-timestamp)}]
    (tu/with-temp Dependency [_ {:model              "Mock"
                                 :model_id           4
                                 :dependent_on_model "foobar"
                                 :dependent_on_id    13
                                 :created_at         (u/new-sql-timestamp)}]
      (format-dependencies (retrieve-dependencies Mock 4)))))


;; update-dependencies

;; we skip over values which aren't integers
(expect
  #{}
  (do
    (update-dependencies Mock 2 {:test ["a" "b" "c"]})
    (set (db/sel :many Dependency :model_id 2))))

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
    (update-dependencies Mock 7 {:test [1 2 3]})
    (format-dependencies (db/sel :many Dependency :model_id 7))))
