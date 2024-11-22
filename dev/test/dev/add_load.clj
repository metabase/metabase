(ns test.dev.add-load
  (:require [clojure.test :refer [deftest is]]
            [metabase.models.interface :as mi]
            [metabase.util :as u]
            [src.dev.add-load :as add-load]
            [toucan2.core :as t2]))

(defn add-load-and-expose-model-id [to-delete script]
  (u/prog1 (add-load/from-script script)
      (reset! to-delete <>)))

(defn- delete-instances [to-delete]
  (map (fn [[model instances]]
         (t2/delete! model :id [:in (map :id instances)]))
       (group-by mi/model (vals @to-delete))))

(deftest card-test
  (let [to-delete (atom {})]
    (try (let [inserted (add-load/from-script [[:model/Card :?/card {:name "ME2"}]
                                               [:model/Card :?/card-two {:name "ME3"}]])]
           (reset! to-delete inserted)
           (doseq [[_k v] inserted]
             (is (= v (t2/select-one :model/Card (u/the-id v)))))
           (is (= (:card inserted) (t2/select-one :model/Card (u/the-id (:card inserted)))))
           (is (= (:card-two inserted) (t2/select-one :model/Card (u/the-id (:card-two inserted))))))
         (finally (delete-instances to-delete)))))
