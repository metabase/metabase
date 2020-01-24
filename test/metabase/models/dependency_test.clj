(ns metabase.models.dependency-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.models.dependency :as dep :refer [Dependency]]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [toucan
             [db :as db]
             [models :as models]]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db))

(models/defmodel ^:private Mock :mock)

(extend (class Mock)
  dep/IDependent
  {:dependencies
   (constantly
    {:a [1 2]
     :b [3 4 5]})})


;; IDependent/dependencies

(expect
  {:a [1 2]
   :b [3 4 5]}
  (dep/dependencies Mock 7 {}))


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
                                 :created_at         :%now}]
                  Dependency [_ {:model              "Mock"
                                 :model_id           4
                                 :dependent_on_model "foobar"
                                 :dependent_on_id    13
                                 :created_at         :%now}]]
    (format-dependencies (dep/retrieve-dependencies Mock 4))))


;; update-dependencies!

;; we skip over values which aren't integers
(expect
  #{}
  (tu/with-model-cleanup [Dependency]
    (dep/update-dependencies! Mock 2 {:test ["a" "b" "c"]})
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
  (tu/with-model-cleanup [Dependency]
    (dep/update-dependencies! Mock 7 {:test [1 2 3]})
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
  (tt/with-temp Dependency [_ {:model               "Mock"
                               :model_id           1
                               :dependent_on_model "test"
                               :dependent_on_id    5
                               :created_at         :%now}]
    (tu/with-model-cleanup [Dependency]
      (dep/update-dependencies! Mock 1 {:test [1 2]})
      (format-dependencies (db/select Dependency, :model "Mock", :model_id 1)))))
