(ns metabase.sync.analyze.classifiers.domain-entity
  (:require [metabase.domain-entities.core :as de]
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
                                  (u/get-id (db/update! 'DomainEntity (:domain_entity table)
                                              domain-entity))

                                  :else
                                  (u/get-id (db/insert! 'DomainEntity
                                              domain-entity))))))
