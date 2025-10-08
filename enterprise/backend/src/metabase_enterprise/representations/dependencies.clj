(ns metabase-enterprise.representations.dependencies
  (:require
   [metabase-enterprise.dependencies.core :as dependencies]
   [metabase-enterprise.representations.import :as import]
   [toucan2.core :as t2]))

(defn check-dependencies
  "Check dependencies of the representations, which should be in order from least dependent to most."
  [representations]
  (let [index (reduce (fn [index [id rep]]
                        (assoc index (:ref rep) (-> (if (= :v0/database (:type rep))
                                                      (import/persist! rep index)
                                                      (-> (import/yaml->toucan rep index)
                                                          (assoc :id (+ Integer/MAX_VALUE id))))
                                                    (assoc ::type (:type rep)))))
                      {}
                      (map vector (range) representations))
        entities (reduce #(merge-with concat %1 %2)
                         {}
                         (map (fn [entity]
                                {(case (::type entity)
                                   :v0/question :card
                                   :v0/collection :collection
                                   :model/Transform :transform
                                   :model/Snippet :snippet
                                   :v0/database :database)
                                 [(dissoc entity ::type)]})
                              (vals index)))
        ;;entities (dissoc entities :database)
        ]
    (dependencies/errors-from-proposed-edits (dissoc entities :database :collection))))

(comment

  (require '[metabase-enterprise.representations.export :as export])
  (export/export-entity (t2/select-one :model/Card :id 93))

  (check-dependencies [(-> (t2/select-one :model/Database :id 3)
                           export/export-entity

                           ;;(import/persist! {}) ;; this will lookup db in the app db
                           )
                       (-> (t2/select-one :model/Card :id 93)
                           export/export-entity
                           (update :type name)
                           import/normalize-representation)]))
