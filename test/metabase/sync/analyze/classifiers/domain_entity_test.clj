(ns metabase.sync.analyze.classifiers.domain-entity-test
  "Tests for the domain entity classifier."
  (:require [expectations :refer :all]
            [metabase.domain-entities.core :as de]
            [metabase.models
             [domain-entity :refer [DomainEntity]]
             [table :refer [Table]]]
            [metabase.sync.analyze.classifiers.domain-entity :refer :all]
            [metabase.test
             [data :as data]
             [domain-entities :refer :all]]))

(expect
  (with-test-domain-entity-specs
    (-> (data/id :venues)
        Table
        (assoc :domain_entity nil) ; make sure we get a fresh domain entity
        assign-domain-entity!
        :domain_entity)))

(expect
  (with-test-domain-entity-specs
    (with-redefs [de/domain-entity-for-table (constantly nil)]
      (-> (data/id :venues)
          Table
          (assoc :domain_entity nil)
          assign-domain-entity!
          :domain_entity
          nil?))))

(expect
  "Updated domain entity"
  (with-test-domain-entity-specs
    (let [table                            (Table (data/id :venues))
          initial-de                       (-> table
                                               assign-domain-entity!
                                               :domain_entity)
          original-domain-entity-for-table de/domain-entity-for-table]
      (with-redefs [de/domain-entity-for-table (fn [table]
                                                 (-> table
                                                     (original-domain-entity-for-table)
                                                     (assoc :name "Updated domain entity")))]
        (-> table
            assign-domain-entity!
            :domain_entity
            DomainEntity
            :name)))))
