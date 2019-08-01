(ns metabase.sync.analyze.classifiers.domain-entity
  (:require [metabase.domain-entities.core :as de]
            [metabase.models.domain-entity :refer [DomainEntity]]
            [metabase.sync.interface :as i]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn assign-domain-entity! :- i/TableInstance
  "Find and instantiate the best fitting domain model."
  [table :- i/TableInstance]
  (let [domain-entity (de/domain-entity-for-table table)]
    (assoc table :domain_entity (cond
                                  (nil? domain-entity)
                                  nil

                                  (:domain_entity table)
                                  (do
                                    (db/update! DomainEntity (:domain_entity table) domain-entity)
                                    (:domain_entity table))


                                  :else
                                  (u/get-id (db/insert! DomainEntity domain-entity))))))
