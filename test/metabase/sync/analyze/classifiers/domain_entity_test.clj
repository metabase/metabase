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
             [domain-entities :refer :all]
             [util :as tu]]))

(expect
  (with-test-domain-entity-specs
    (tu/with-model-cleanup ['DomainEntity]
      (-> (data/id :venues)
          Table
          (assoc :domain_entity nil) ; make sure we get a fresh domain entity
          assign-domain-entity!
          :domain_entity))))

(expect
  (with-test-domain-entity-specs
    (tu/with-model-cleanup ['DomainEntity]
      (with-redefs [de/domain-entity-for-table (constantly nil)]
        (-> (data/id :venues)
            Table
            (assoc :domain_entity nil)
            assign-domain-entity!
            :domain_entity
            nil?)))))

(expect
  "Updated domain entity"
  (with-test-domain-entity-specs
    (tu/with-model-cleanup ['DomainEntity]
      (let [table      (Table (data/id :venues))
            initial-de (-> table
                           assign-domain-entity!
                           :domain_entity)]
        (with-redefs [de/domain-entity-for-table (fn [table]
                                                   (-> table
                                                       (de/domain-entity-for-table)
                                                       (assoc :name "Updated domain entity")))]
          (-> table
              assign-domain-entity!
              :domain_entity
              DomainEntity
              :name))))))
